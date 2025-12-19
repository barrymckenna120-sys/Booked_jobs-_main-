import { useState, useEffect } from "react";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const targetDate = new Date("2025-01-31T23:59:59");

    const calculateTimeLeft = () => {
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / (1000 * 60)) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, []);

  const TimeBlock = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="bg-cta text-white rounded-lg w-14 h-14 flex items-center justify-center text-2xl font-bold shadow-md">
        {value.toString().padStart(2, "0")}
      </div>
      <span className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{label}</span>
    </div>
  );

  return (
    <div className="flex items-center justify-center gap-2">
      <TimeBlock value={timeLeft.days} label="Days" />
      <span className="text-2xl font-bold text-cta mb-5">:</span>
      <TimeBlock value={timeLeft.hours} label="Hours" />
      <span className="text-2xl font-bold text-cta mb-5">:</span>
      <TimeBlock value={timeLeft.minutes} label="Mins" />
      <span className="text-2xl font-bold text-cta mb-5">:</span>
      <TimeBlock value={timeLeft.seconds} label="Secs" />
    </div>
  );
};
