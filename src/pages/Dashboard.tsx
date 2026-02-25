import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Settings, Plus, LogOut, Users, Phone, MapPin } from "lucide-react";

const Dashboard = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchCustomers();
  }, [user]);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setCustomers(data);
    setLoading(false);
  };

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q) ||
      c.eircode?.toLowerCase().includes(q)
    );
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "Overdue": return "destructive";
      case "Due Soon": return "secondary";
      default: return "default";
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">⛽ Karl's Gas</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{customers.length}</p>
                <p className="text-sm text-muted-foreground">Total Customers</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <Phone className="w-8 h-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">
                  {customers.filter((c) => c.service_status === "Overdue").length}
                </p>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-3">
              <MapPin className="w-8 h-8 text-success" />
              <div>
                <p className="text-2xl font-bold">
                  {customers.filter((c) => c.service_status === "Due Soon").length}
                </p>
                <p className="text-sm text-muted-foreground">Due Soon</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search + Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading customers...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {customers.length === 0
                  ? "No customers yet. Import some from Settings → Data Import."
                  : "No customers match your search."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="hidden md:table-cell">Address</TableHead>
                      <TableHead className="hidden md:table-cell">Eircode</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/customers/${c.id}`)}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.phone}</TableCell>
                        <TableCell className="hidden md:table-cell">{c.address}</TableCell>
                        <TableCell className="hidden md:table-cell">{c.eircode}</TableCell>
                        <TableCell>
                          <Badge variant={statusColor(c.service_status) as any}>
                            {c.service_status || "Up to Date"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
