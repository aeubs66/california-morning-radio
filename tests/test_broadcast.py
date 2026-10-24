import datetime as dt
import io
import json
import unittest
from unittest.mock import patch
import numpy as np
from radio import broadcast as b

class FakeHTTP:
    def __init__(self, data): self.data=data
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self): return json.dumps(self.data).encode()

class BroadcastTest(unittest.TestCase):
    def setUp(self):
        self.today=dt.datetime.now(b.ZONE).date()
        self.dates=[self.today.isoformat(),(self.today+dt.timedelta(days=1)).isoformat(),(self.today+dt.timedelta(days=2)).isoformat()]
        self.data={
            'current':{'time':dt.datetime.now(b.ZONE).replace(tzinfo=None).isoformat(timespec='minutes'),
                       'temperature_2m':56.7,'weather_code':2,'wind_speed_10m':8},
            'daily':{'time':self.dates,'temperature_2m_max':[69.1,72.6,71],
                     'temperature_2m_min':[52.1,54.5,50],
                     'weather_code':[2,3,0],
                     'precipitation_probability_max':[5,24,1]}}
    def test_forecast_is_grounded(self):
        with patch.object(b.urllib.request,'urlopen',return_value=FakeHTTP(self.data)):
            r=b.fetch_weather('san-francisco',self.today)
        self.assertEqual(r.current_temp,57)
        self.assertEqual(r.today_high,69)
        self.assertEqual(r.tomorrow_high,73)
        script=b.script_for(r)
        for x in ['San Francisco','57 degrees','69 degrees','73','partly cloudy','overcast']:
            self.assertIn(x,script)
        self.assertNotIn('chance of precipitation',script)  # Only narrated when >=15%
    def test_wrong_day_fails_closed(self):
        self.data['daily']['time']=['2022-01-01','2022-01-02','2022-01-03']
        with patch.object(b.urllib.request,'urlopen',return_value=FakeHTTP(self.data)):
            with self.assertRaises(RuntimeError): b.fetch_weather('los-angeles',self.today)
    def test_missing_temperature_fails_closed(self):
        self.data['daily']['temperature_2m_min'][0]=None
        with patch.object(b.urllib.request,'urlopen',return_value=FakeHTTP(self.data)):
            with self.assertRaises(RuntimeError): b.fetch_weather('los-angeles',self.today)
    def test_audio_has_intro_and_fade(self):
        waveform=b.mix_audio(np.sin(2*np.pi*150*np.arange(24000)/24000).astype(np.float32)*.3,42)
        self.assertGreater(len(waveform),24000*6)
        self.assertLess(abs(float(waveform[0])),.002)
        self.assertLess(abs(float(waveform[-1])),.002)
        self.assertLessEqual(np.max(np.abs(waveform)),.98)

if __name__ == '__main__': unittest.main()
