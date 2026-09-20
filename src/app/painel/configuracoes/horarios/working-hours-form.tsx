"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WeeklyHoursEditor } from "@/components/dashboard/weekly-hours-editor";
import { updateCompanyWorkingHoursAction } from "@/server/actions/settings";
import type { WorkingHourIntervalInput } from "@/lib/validations/professional";

export function WorkingHoursForm({ initial }: { initial: WorkingHourIntervalInput[] }) {
  const [value, setValue] = useState<WorkingHourIntervalInput[]>(initial);
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-4">
      <WeeklyHoursEditor value={value} onChange={setValue} />
      <Button
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const result = await updateCompanyWorkingHoursAction(value);
          setLoading(false);
          if (!result.success) toast.error(result.message ?? "Não foi possível salvar.");
          else toast.success("Horários de funcionamento atualizados!");
        }}
      >
        {loading ? "Salvando..." : "Salvar horários"}
      </Button>
    </div>
  );
}
