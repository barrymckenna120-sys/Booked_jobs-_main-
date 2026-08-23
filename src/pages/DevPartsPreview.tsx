// TEMPORARY verification harness for BJ-0078 — deleted after screenshots.
import EngineerJobCard from "@/components/engineer/EngineerJobCard";

const baseJob = {
  id: "00000000-0000-0000-0000-000000000001",
  job_reference: "KN-901",
  job_type: "Repair",
  time_block: "9–11",
  scheduled_date: "2026-08-23",
  customer_id: null,
  organisation_id: null,
  notes: "Parts Needed [urgent]: Diverter valve for Ideal Logic 24",
  deposit_required: false,
  deposit_paid: false,
  revenue: 180,
};

const customer = {
  name: "Test Customer",
  address: "12 Sample Road, Swords",
  eircode: "K67 X1Y2",
  area_code: "K67",
  phone: "353871234567",
};

const CARDS = [
  { status: "parts_needed", ref: "KN-901" },
  { status: "parts_ordered", ref: "KN-902" },
  { status: "parts_arrived", ref: "KN-903" },
];

const DevPartsPreview = () => (
  <div className="p-4 max-w-md mx-auto bg-background min-h-screen">
    {CARDS.map((c) => (
      <div key={c.status} data-testid={`card-${c.status}`}>
        <div className="text-xs font-mono text-muted-foreground mb-1">{c.status}</div>
        <EngineerJobCard
          job={{ ...baseJob, id: `0000-${c.status}`, job_reference: c.ref, status: c.status }}
          customer={customer}
          onUpdate={() => {}}
          isNextJob
        />
      </div>
    ))}
  </div>
);

export default DevPartsPreview;
