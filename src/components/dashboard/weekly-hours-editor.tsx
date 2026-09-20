"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { WEEKDAY_LABELS_SHORT } from "@/lib/constants";
import type { WorkingHourIntervalInput } from "@/lib/validations/professional";

type Interval = Omit<WorkingHourIntervalInput, "dayOfWeek">;

export function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: WorkingHourIntervalInput[];
  onChange: (value: WorkingHourIntervalInput[]) => void;
}) {
  function intervalsForDay(day: number): Interval[] {
    return value.filter((v) => v.dayOfWeek === day).map(({ startTime, endTime }) => ({ startTime, endTime }));
  }

  function setDayIntervals(day: number, intervals: Interval[]) {
    const rest = value.filter((v) => v.dayOfWeek !== day);
    const next = [...rest, ...intervals.map((i) => ({ dayOfWeek: day, ...i }))];
    onChange(next);
  }

  function toggleDay(day: number, open: boolean) {
    if (open) {
      setDayIntervals(day, [{ startTime: "09:00", endTime: "18:00" }]);
    } else {
      setDayIntervals(day, []);
    }
  }

  return (
    <div className="space-y-3">
      {WEEKDAY_LABELS_SHORT.map((label, day) => {
        const intervals = intervalsForDay(day);
        const isOpen = intervals.length > 0;
        return (
          <div key={day} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <Switch checked={isOpen} onCheckedChange={(v) => toggleDay(day, v)} />
            </div>
            {isOpen && (
              <div className="mt-2 space-y-2">
                {intervals.map((interval, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={interval.startTime}
                      onChange={(e) => {
                        const next = [...intervals];
                        next[idx] = { ...next[idx], startTime: e.target.value };
                        setDayIntervals(day, next);
                      }}
                      className="w-28"
                    />
                    <span className="text-muted-foreground">até</span>
                    <Input
                      type="time"
                      value={interval.endTime}
                      onChange={(e) => {
                        const next = [...intervals];
                        next[idx] = { ...next[idx], endTime: e.target.value };
                        setDayIntervals(day, next);
                      }}
                      className="w-28"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = intervals.filter((_, i) => i !== idx);
                        setDayIntervals(day, next);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDayIntervals(day, [...intervals, { startTime: "09:00", endTime: "18:00" }])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar intervalo
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
