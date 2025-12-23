import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const ticketSchema = z.object({
  ticketNumber: z
    .string()
    .min(5, { message: "Biljettnummer måste vara minst 5 tecken" }),
  price: z.string().min(1, { message: "Pris måste anges" }),
});

interface ValidateTicketResponse {
  success: boolean;
  ticketId: string | number;
  status: "OK" | "Rejected" | "NotValidated";
  message?: string;
}

const RegisterTicket = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ticketNumber, setTicketNumber] = useState("");
  const [price, setPrice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Get API URL from environment variable or use production URL
  const API_BASE_URL =
    import.meta.env.VITE_XTRAFIK_API_URL || "https://collaktiv.fly.dev";

  const validateTicketWithXTrafik = async (
    ticketId: string
  ): Promise<ValidateTicketResponse> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/validate-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticketId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Kunde inte ansluta till valideringsservern");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setIsValidating(true);

    try {
      // Validate form inputs
      ticketSchema.parse({ ticketNumber, price });

      // Step 1: Validate ticket with X-trafik API
      let validationResult: ValidateTicketResponse;
      try {
        validationResult = await validateTicketWithXTrafik(ticketNumber);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Okänt fel vid validering";
        toast.error(`Validering misslyckades: ${errorMessage}`);
        setIsLoading(false);
        setIsValidating(false);
        return;
      } finally {
        setIsValidating(false);
      }

      // Step 2: Check validation result
      if (!validationResult.success || validationResult.status !== "OK") {
        let errorMessage = "Biljetten kunde inte valideras";

        if (validationResult.status === "Rejected") {
          errorMessage =
            "Biljetten är ogiltig eller hittades inte i X-trafik systemet";
        } else if (validationResult.status === "NotValidated") {
          errorMessage =
            validationResult.message ||
            "Kunde inte validera biljetten. Försök igen senare.";
        }

        toast.error(errorMessage);
        setIsLoading(false);
        return;
      }

      // Step 3: Ticket is valid, register it in Supabase
      const { data, error } = await supabase.rpc("register_ticket", {
        p_ticket_number: ticketNumber,
        p_points: 10,
        p_price: parseFloat(price) || null,
      });

      if (error) {
        // Log full error details for debugging
        console.error("Supabase RPC error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: error,
        });
        
        // Try to provide a more helpful error message
        let errorMessage = "Kunde inte registrera biljett";
        if (error.message) {
          errorMessage = error.message;
        } else if (error.details) {
          errorMessage = error.details;
        } else if (error.hint) {
          errorMessage = error.hint;
        }
        
        toast.error(`Registrering misslyckades: ${errorMessage}`);
        setIsLoading(false);
        return;
      }

      toast.success("Biljett registrerad! +10 resepoäng 🎉");
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error("Ett fel uppstod vid registrering");
      }
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 bg-background/80 backdrop-blur-xl z-50 border-b border-primary/10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Registrera biljett</h1>
        </div>
      </header>

      <main className="pt-20 pb-24 px-4">
        <div className="container mx-auto max-w-2xl">
          <Card className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-full bg-primary/10">
                <Ticket className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Ny biljett</h2>
                <p className="text-sm text-muted-foreground">
                  Tjäna 10 resepoäng per biljett
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Biljettnummer
                </label>
                <Input
                  type="text"
                  placeholder="Ange biljettnummer"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Pris (kr)
                </label>
                <Input
                  type="number"
                  placeholder="Pris"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <Card className="p-4 bg-primary/5 border-primary/20">
                <h3 className="font-semibold mb-2">
                  Hur hittar du biljettnumret?
                </h3>
                <p className="text-sm text-muted-foreground">
                  I X-trafik appen: "Mer..." → "Förbrukade biljetter/kvitton",
                  klicka på information-ikonen till höger och se ditt
                  biljett-ID.
                </p>
              </Card>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || isValidating}
              >
                {isValidating
                  ? "Validerar biljett..."
                  : isLoading
                  ? "Registrerar..."
                  : "Registrera biljett"}
              </Button>

              {isValidating && (
                <p className="text-sm text-muted-foreground text-center">
                  Kontrollerar biljett med X-trafik...
                </p>
              )}
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default RegisterTicket;
