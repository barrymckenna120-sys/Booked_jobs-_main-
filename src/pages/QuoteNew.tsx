import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuoteForm from "@/components/quotes/QuoteForm";

const QuoteNew = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/quotes")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-xl font-extrabold text-foreground">New Quote</h1>
      </div>
      <QuoteForm onSaved={() => navigate("/quotes")} />
    </div>
  );
};

export default QuoteNew;
