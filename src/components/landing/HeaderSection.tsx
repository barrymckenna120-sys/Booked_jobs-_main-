import webliveviewLogo from "@/assets/webliveview-logo.jpg";

export const HeaderSection = () => {
  return (
    <header className="section-container pt-4 pb-2">
      <div className="h-12 overflow-hidden">
        <img 
          src={webliveviewLogo} 
          alt="WebLiveView" 
          className="h-16 w-auto object-cover object-top"
        />
      </div>
    </header>
  );
};
