from dataclasses import dataclass
from typing import Optional


@dataclass
class ThermalEventRecord:
    latitude: float
    longitude: float
    frp: Optional[float] = None
    brightness: Optional[float] = None
    confidence: Optional[int] = None
    acquisition_date: Optional[str] = None
    acquisition_time: Optional[int] = None
    satellite: Optional[str] = None
    instrument: Optional[str] = None
    version: Optional[str] = None
    daynight: Optional[str] = None
    firms_source: Optional[str] = None
    bright_ti4: Optional[float] = None
    bright_ti5: Optional[float] = None
    bright_t31: Optional[float] = None
    scan: Optional[float] = None
    track: Optional[float] = None
