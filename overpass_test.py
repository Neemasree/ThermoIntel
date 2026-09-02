import requests
r = requests.post(
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    data={'data': '[out:json][timeout:10];(node[landuse=industrial](around:5000,22.3072,69.9520););out body;'},
    timeout=20
)
import json
d = r.json()
print('Overpass HTTP:', r.status_code, '| elements:', len(d.get('elements', [])))
