import { useLocation, useNavigate } from "react-router-dom";

const TABS = [
  { label: "Job History", path: "/engineer/completed" },
  { label: "My Parts", path: "/engineer/parts" },
];

/** Segmented control pairing Completed jobs with the engineer's parts requests. */
const PartsSectionTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex bg-secondary rounded-xl p-1 gap-1" role="tablist">
      {TABS.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            role="tab"
            aria-selected={active}
            onClick={() => navigate(tab.path)}
            className={`flex-1 min-h-[44px] rounded-lg text-[13px] font-bold transition-colors ${
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground/80 active:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default PartsSectionTabs;
