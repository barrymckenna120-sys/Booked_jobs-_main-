import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuoteForm from "@/components/quotes/QuoteForm";

const QuoteEdit = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/quotes/${id}`)}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-xl font-extrabold text-foreground">Edit Quote</h1>
      </div>
      <QuoteForm quoteId={id} onSaved={() => navigate(`/quotes/${id}`)} />
    </div>
  );
};

export default QuoteEdit;
