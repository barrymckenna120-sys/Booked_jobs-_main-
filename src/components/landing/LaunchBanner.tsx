export const LaunchBanner = () => {
  return (
    <div className="relative w-full bg-gradient-to-r from-warning via-warning/90 to-warning overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.25)_50%,transparent_75%)] animate-[shimmer_2.5s_ease-in-out_infinite] bg-[length:250%_100%]" />
      <p className="relative text-center text-warning-foreground text-sm font-bold py-2 px-4 tracking-wide">
        🚀 BookedJobs is launching soon — be the first to know!
      </p>
    </div>
  );
};
