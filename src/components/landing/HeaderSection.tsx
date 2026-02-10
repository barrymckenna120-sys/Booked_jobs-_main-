import bookedjobsLogo from "@/assets/bookedjobs-logo.jpg";

export const HeaderSection = () => {
  return (
    <header className="section-container pt-4 pb-2">
      <img 
        src={bookedjobsLogo} 
        alt="BookedJobs" 
        className="h-10 object-contain object-left"
      />
    </header>
  );
};
