import webliveviewLogo from "@/assets/webliveview-logo.jpg";

export const HeaderSection = () => {
  return (
    <header className="section-container pt-4 pb-2">
      <img 
        src={webliveviewLogo} 
        alt="WebLiveView" 
        className="w-[250px] h-[100px] object-contain object-left"
      />
    </header>
  );
};
