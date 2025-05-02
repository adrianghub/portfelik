import { Button } from "@/components/ui/button";
import { MonthRangePicker } from "@/components/ui/monthrangepicker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import dayjs, { DayjsDate, getMonthNameWithYear } from "@/lib/date-utils";
import { cn } from "@/lib/styling-utils";
import { CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface DateRange {
  start: DayjsDate;
  end: DayjsDate;
}

interface DateRangeFilterProps {
  startDate: DayjsDate;
  endDate: DayjsDate;
  onDateRangeChange: (dateRange: DateRange) => void;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onDateRangeChange,
}: DateRangeFilterProps) {
  const { t } = useTranslation();

  const minDateJs = dayjs("2025-01-01").toDate();

  const handleMonthRangeChange = (
    range: { start: Date; end: Date } | undefined,
  ) => {
    if (range) {
      const newRange = {
        start: dayjs(range.start).startOf("month"),
        end: dayjs(range.end).endOf("month"),
      };
      onDateRangeChange(newRange);
    }
  };

  const displayStartDate = startDate;
  const displayEndDate = endDate;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant={"outline"}
          className={cn(
            "justify-start text-left font-normal h-9 px-3",
            !displayStartDate && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayStartDate ? (
            displayEndDate &&
            displayStartDate.isSame(displayEndDate, "month") ? (
              getMonthNameWithYear(displayStartDate)
            ) : displayEndDate ? (
              <>
                {getMonthNameWithYear(displayStartDate)} -{" "}
                {getMonthNameWithYear(displayEndDate)}
              </>
            ) : (
              displayStartDate.format("MMM YYYY")
            )
          ) : (
            <span>{t("transactions.pickAMonthRange")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <MonthRangePicker
          selectedMonthRange={{
            start: displayStartDate.toDate(),
            end: displayEndDate.toDate(),
          }}
          onMonthRangeSelect={handleMonthRangeChange}
          minDate={minDateJs}
        />
      </PopoverContent>
    </Popover>
  );
}
