import { useEffect, useState } from 'react';

const DAY_START_HOUR = 6;
const DAY_END_HOUR = 18;
const MALAYSIA_OFFSET_HOURS = 8;

function getMalaysiaHour(): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const myt = new Date(utcMs + MALAYSIA_OFFSET_HOURS * 60 * 60 * 1000);
  return myt.getHours();
}

function getSchemeForNow(): 'light' | 'dark' {
  const hour = getMalaysiaHour();
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? 'light' : 'dark';
}

export function useTimeScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(getSchemeForNow);

  useEffect(() => {
    const tick = () => setScheme(getSchemeForNow());
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return scheme;
}
