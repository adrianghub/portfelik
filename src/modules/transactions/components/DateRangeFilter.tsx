import dayjs, {
  DayjsDate,
  formatMonth,
  getFirstDayOfMonth,
  getLastDayOfMonth,
} from "@/lib/date-utils";
import { useEffect, useState } from "react";
import { MonthPicker } from "./MonthPicker";

export interface DateRange {
  start: DayjsDate;
  end: DayjsDate;
}

interface DateRangeFilterProps {
  onDateRangeChange: (dateRange: DateRange) => void;
}

export function DateRangeFilter({ onDateRangeChange }: DateRangeFilterProps) {
  const [currentDate, setCurrentDate] = useState(dayjs());

  const today = dayjs();
  const currentYearStart = dayjs().startOf("year");

  useEffect(() => {
    const startDate = getFirstDayOfMonth(currentDate);
    const endDate = getLastDayOfMonth(currentDate);

    onDateRangeChange({ start: startDate, end: endDate });
  }, [currentDate, onDateRangeChange]);

  const handleMonthChange = (date: DayjsDate) => {
    setCurrentDate(date);
  };

  return (
    <div className="flex items-center space-x-3">
      <MonthPicker
        value={currentDate}
        onChange={handleMonthChange}
        maxDate={today}
        minDate={currentYearStart}
      />
    </div>
  );
}

export function getMonthName(date: DayjsDate): string {
  return formatMonth(date);
}
