import {
  Dialog,
  DialogTrigger,
  DialogContent,
} from "@/components/ui/dialog";
import { PremiumTable } from "./premiumTable";
import { PremiumFAQ } from "./premiumFAQ";
import { Button } from "@/components/ui/button";

export function PremiumDialog() {
  return (
    <div className="h-screen">
      <Dialog>
        <DialogTrigger asChild>
          <Button className="text-lg font-bold px-6 py-3 bg-primary text-foreground rounded-lg hover:bg-primary/90">
            Open Premium Plans
          </Button>
        </DialogTrigger>
        <DialogContent className="h-[95%] w-full max-w-7xl mx-auto space-y-8 overflow-auto">
          <div className="space-y-16">
            <PremiumTable />
            <PremiumFAQ />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
