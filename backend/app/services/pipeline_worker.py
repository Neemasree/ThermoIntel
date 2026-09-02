"""
ThermalWatch — Background Pipeline Worker
==========================================

Scheduled jobs:

1. FIRMS ingestion      (every FIRMS_POLL_INTERVAL_MINUTES, default 15)
2. WorldCover enrich    (after FIRMS if new events, and at startup)
3. OSM enrichment       (every OSM_ENRICH_INTERVAL_MINUTES, default 60)
4. Temporal/anomaly     (every TEMPORAL_COMPUTE_INTERVAL_MINUTES, default 30)

Async pipeline:
  FIRMS INSERT → osm_enrichment_status='pending', temporal_computed_at=NULL
               → worldcover_enrichment_status='pending'
  Each enrichment job is independent — FIRMS never waits for them.

Multi-process safety:
  PostgreSQL advisory lock (pg_try_advisory_lock) so only one uvicorn
  worker runs the scheduler.

Environment variables:
  FIRMS_POLL_INTERVAL_MINUTES        default 15
  OSM_ENRICH_INTERVAL_MINUTES        default 60
  TEMPORAL_COMPUTE_INTERVAL_MINUTES  default 30
  WC_ENRICH_AFTER_FIRMS              default true
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

FIRMS_POLL_INTERVAL_MINUTES       = int(os.getenv("FIRMS_POLL_INTERVAL_MINUTES",       "15"))
OSM_ENRICH_INTERVAL_MINUTES       = int(os.getenv("OSM_ENRICH_INTERVAL_MINUTES",       "60"))
TEMPORAL_COMPUTE_INTERVAL_MINUTES = int(os.getenv("TEMPORAL_COMPUTE_INTERVAL_MINUTES", "30"))
WC_ENRICH_AFTER_FIRMS             = os.getenv("WC_ENRICH_AFTER_FIRMS", "true").lower() == "true"

_scheduler: Optional[BackgroundScheduler] = None
_ADVISORY_LOCK_ID = 7734213


# =============================================================================
# ADVISORY LOCK
# =============================================================================

def _try_acquire_worker_lock() -> bool:
    from app.database.connection import get_connection
    try:
        conn = get_connection()
        conn.set_isolation_level(0)
        cur = conn.cursor()
        cur.execute("SELECT pg_try_advisory_lock(%s);", (_ADVISORY_LOCK_ID,))
        acquired = cur.fetchone()[0]
        _try_acquire_worker_lock._lock_conn = conn   # keep alive
        return acquired
    except Exception as exc:
        logger.warning("Could not acquire advisory lock: %s", exc)
        return True   # fail-open


# =============================================================================
# PIPELINE STATUS HELPERS
# =============================================================================

def _update_pipeline_status(
    source: str,
    *,
    last_attempt: Optional[datetime] = None,
    last_success: Optional[datetime] = None,
    last_fetched:   int = 0,
    last_inserted:  int = 0,
    last_updated:   int = 0,
    last_unchanged: int = 0,
    last_error: Optional[str] = None,
    worker_status: str = "idle",
) -> None:
    from app.database.connection import get_db_cursor
    now = datetime.now(timezone.utc)
    try:
        with get_db_cursor() as cur:
            cur.execute("""
                INSERT INTO pipeline_status
                    (source, last_attempt, last_success,
                     last_fetched, last_inserted, last_updated,
                     last_unchanged, last_error, worker_status, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (source) DO UPDATE SET
                    last_attempt  = EXCLUDED.last_attempt,
                    last_success  = COALESCE(EXCLUDED.last_success,
                                             pipeline_status.last_success),
                    last_fetched  = EXCLUDED.last_fetched,
                    last_inserted = EXCLUDED.last_inserted,
                    last_updated  = EXCLUDED.last_updated,
                    last_unchanged= EXCLUDED.last_unchanged,
                    last_error    = EXCLUDED.last_error,
                    worker_status = EXCLUDED.worker_status,
                    updated_at    = EXCLUDED.updated_at;
            """, (
                source,
                last_attempt or now,
                last_success,
                last_fetched, last_inserted, last_updated, last_unchanged,
                last_error, worker_status, now,
            ))
    except Exception as exc:
        logger.error("Failed to update pipeline_status for %s: %s", source, exc)


# =============================================================================
# JOB 1 — FIRMS INGESTION  (unchanged)
# =============================================================================

def job_firms_ingestion() -> None:
    """Poll all FIRMS NRT sources, upsert, write status."""
    from app.services.firms_service import FIRMS_SOURCES, fetch_firms_source
    from app.database.setup import upsert_firms_records

    logger.info("FIRMS poll starting …")
    now = datetime.now(timezone.utc)

    total_new = total_changed = total_unchanged = total_failed = 0
    any_error: Optional[str] = None

    for source in FIRMS_SOURCES:
        _update_pipeline_status(source, last_attempt=now, worker_status="running")
        try:
            df     = fetch_firms_source(source=source, days=1, area="world", timeout=90)
            result = upsert_firms_records(df, source)

            total_new       += result["new"]
            total_changed   += result["changed"]
            total_unchanged += result["unchanged"]
            total_failed    += result["failed"]

            _update_pipeline_status(
                source,
                last_attempt=now,
                last_success=datetime.now(timezone.utc),
                last_fetched=result["fetched"],
                last_inserted=result["new"],
                last_updated=result["changed"],
                last_unchanged=result["unchanged"],
                worker_status="idle",
            )
            logger.info(
                "FIRMS %s: fetched=%d new=%d changed=%d unchanged=%d",
                source, result["fetched"], result["new"],
                result["changed"], result["unchanged"],
            )
        except Exception as exc:
            err_msg = str(exc)[:500]
            any_error = err_msg
            total_failed += 1
            _update_pipeline_status(
                source, last_attempt=now,
                last_error=err_msg, worker_status="error",
            )
            logger.error("FIRMS %s failed: %s", source, err_msg)

    _update_pipeline_status(
        "ALL_SOURCES",
        last_attempt=now,
        last_success=datetime.now(timezone.utc) if not any_error else None,
        last_inserted=total_new,
        last_updated=total_changed,
        last_unchanged=total_unchanged,
        last_error=any_error,
        worker_status="idle" if not any_error else "error",
    )

    logger.info(
        "FIRMS poll done: new=%d changed=%d unchanged=%d failed=%d",
        total_new, total_changed, total_unchanged, total_failed,
    )

    # Trigger WorldCover for newly arrived events (non-blocking thread)
    if WC_ENRICH_AFTER_FIRMS and (total_new + total_changed) > 0:
        threading.Thread(
            target=job_worldcover_enrichment, daemon=True, name="wc-post-firms"
        ).start()


# =============================================================================
# JOB 2 — WORLDCOVER ENRICHMENT
# =============================================================================

def job_worldcover_enrichment() -> None:
    """Enrich pending events with ESA WorldCover 2021 v200."""
    from app.services.worldcover_service import run_enrich, _count_unenriched

    pending = _count_unenriched()
    if pending == 0:
        logger.info("WorldCover: no pending events")
        return

    logger.info("WorldCover: enriching %d pending events …", pending)
    try:
        run_enrich(force=False)
        logger.info("WorldCover enrichment complete")
    except Exception as exc:
        logger.error("WorldCover enrichment error: %s", exc)


# =============================================================================
# JOB 3 — OSM ENRICHMENT
# =============================================================================

def job_osm_enrichment() -> None:
    """Enrich a batch of pending events with OSM/Overpass spatial context."""
    from app.services.overpass_service import run_osm_enrichment, count_osm_pending

    pending = count_osm_pending()
    if pending == 0:
        logger.info("OSM enrichment: no pending events")
        return

    logger.info("OSM enrichment: %d pending — processing batch …", pending)
    try:
        stats = run_osm_enrichment()
        logger.info("OSM enrichment batch done: %s", stats)
    except Exception as exc:
        logger.error("OSM enrichment error: %s", exc)


# =============================================================================
# JOB 4 — TEMPORAL / ANOMALY FEATURES
# =============================================================================

def job_temporal_computation() -> None:
    """
    Compute temporal and anomaly features for events that have
    temporal_computed_at IS NULL.

    Runs AFTER FIRMS ingestion and enrichment so that newly inserted
    events accumulate spatial neighbours before their features are computed.

    Does NOT block FIRMS ingestion.
    """
    from app.services.temporal_service import (
        count_temporal_pending, compute_temporal_batch,
    )

    pending = count_temporal_pending()
    if pending == 0:
        logger.info("Temporal: no pending events")
        return

    logger.info("Temporal: %d events pending feature computation …", pending)
    try:
        stats = compute_temporal_batch()
        logger.info("Temporal batch done: %s", stats)
    except Exception as exc:
        logger.error("Temporal computation error: %s", exc)


# =============================================================================
# SCHEDULER LIFECYCLE
# =============================================================================

def start_scheduler() -> bool:
    global _scheduler

    if not _try_acquire_worker_lock():
        logger.info(
            "Another worker process holds the scheduler lock — skipping."
        )
        return False

    if _scheduler is not None and _scheduler.running:
        logger.info("Scheduler already running")
        return True

    _scheduler = BackgroundScheduler(
        job_defaults={"misfire_grace_time": 60, "coalesce": True},
        timezone="UTC",
    )

    _scheduler.add_job(
        job_firms_ingestion,
        trigger=IntervalTrigger(minutes=FIRMS_POLL_INTERVAL_MINUTES),
        id="firms_ingestion",
        name="FIRMS NRT Ingestion",
        replace_existing=True,
    )
    _scheduler.add_job(
        job_osm_enrichment,
        trigger=IntervalTrigger(minutes=OSM_ENRICH_INTERVAL_MINUTES),
        id="osm_enrichment",
        name="OSM Overpass Enrichment",
        replace_existing=True,
    )
    _scheduler.add_job(
        job_temporal_computation,
        trigger=IntervalTrigger(minutes=TEMPORAL_COMPUTE_INTERVAL_MINUTES),
        id="temporal_computation",
        name="Temporal & Anomaly Features",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(
        "Scheduler started — FIRMS every %dm, OSM every %dm, Temporal every %dm",
        FIRMS_POLL_INTERVAL_MINUTES,
        OSM_ENRICH_INTERVAL_MINUTES,
        TEMPORAL_COMPUTE_INTERVAL_MINUTES,
    )

    # At startup: run WorldCover and temporal backlog in background threads
    threading.Thread(
        target=job_worldcover_enrichment, daemon=True, name="wc-startup"
    ).start()
    threading.Thread(
        target=job_temporal_computation, daemon=True, name="temporal-startup"
    ).start()

    return True


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
    _scheduler = None


def get_scheduler_status() -> dict:
    if _scheduler is None or not _scheduler.running:
        return {"running": False, "jobs": []}
    return {
        "running": True,
        "jobs": [
            {
                "id":       job.id,
                "name":     job.name,
                "next_run": job.next_run_time.isoformat()
                            if job.next_run_time else None,
            }
            for job in _scheduler.get_jobs()
        ],
    }
