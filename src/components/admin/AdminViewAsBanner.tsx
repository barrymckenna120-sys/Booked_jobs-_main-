import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import { Button } from "@/components/ui/button";

const AdminViewAsBanner = () => {
  const { viewingOrgId, viewingOrgName, isSuperAdmin, setViewingOrg } = useAdminViewAs();
  if (!isSuperAdmin || !viewingOrgId) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-400 text-amber-950 border-b border-amber-600">
      <div className="flex items-center justify-center gap-2 px-3 py-0.5 text-xs font-semibold leading-none">
        <span>Viewing: {viewingOrgName || viewingOrgId}</span>
        <Button
          size="sm"
          variant="outline"
          className="h-5 px-2 py-0 text-[11px] leading-none bg-amber-100 hover:bg-amber-200 border-amber-700 text-amber-950"
          onClick={() => setViewingOrg(null)}
        >
          Exit
        </Button>
      </div>
    </div>
  );
};

export default AdminViewAsBanner;
