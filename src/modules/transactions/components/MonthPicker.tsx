import { Button } from "@/components/ui/button";
import dayjs, { DayjsDate, getMonthName } from "@/lib/date-utils";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface MonthPickerProps {
  value: DayjsDate;
  onChange: (date: DayjsDate) => void;
  maxDate?: DayjsDate;
  minDate?: DayjsDate;
}

export function MonthPicker({
  value,
  onChange,
  maxDate = dayjs(),
  minDate = dayjs().startOf("year"),
}: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value.year());

  const currentMonth = value.month();
  const currentYear = value.year();

  const maxYear = maxDate.year();
  const maxMonth = maxDate.month();

  const minYear = minDate.year();
  const minMonth = minDate.month();

  const handleYearChange = (increment: number) => {
    const newYear = viewYear + increment;
    if (newYear <= maxYear && newYear >= minYear) {
      setViewYear(newYear);
    }
  };

  const handleMonthSelect = (monthIndex: number) => {
    // Don't allow selecting months beyond maxDate or before minDate
    if (
      (viewYear === maxYear && monthIndex > maxMonth) ||
      (viewYear === minYear && monthIndex < minMonth)
    ) {
      return;
    }

    const newDate = value.clone().month(monthIndex).year(viewYear);
    onChange(newDate);
    setIsOpen(false);
  };

  const isSelectedMonth = (monthIndex: number) => {
    return currentMonth === monthIndex && currentYear === viewYear;
  };

  const isDisabledMonth = (monthIndex: number) => {
    return (
      (viewYear === maxYear && monthIndex > maxMonth) ||
      (viewYear === minYear && monthIndex < minMonth)
    );
  };

  return (
    <div className="relative">
      <div className="inline-flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-2 h-9 px-3"
        >
          <Calendar className="h-4 w-4" />
          <span>
            {getMonthName(value)} {currentYear}
          </span>
        </Button>
      </div>

      {isOpen && (
        <div className="absolute z-10 mt-1 bg-background rounded-md shadow-lg border p-3 w-[300px]">
          <div className="flex justify-between items-center mb-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleYearChange(-1)}
              className="h-7 w-7"
              disabled={viewYear <= minYear}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-medium">{viewYear}</div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleYearChange(1)}
              className="h-7 w-7"
              disabled={viewYear >= maxYear}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((month, index) => (
              <Button
                key={month}
                variant={isSelectedMonth(index) ? "default" : "outline"}
                size="sm"
                disabled={isDisabledMonth(index)}
                onClick={() => handleMonthSelect(index)}
                className={`
                  text-sm py-1
                  ${isSelectedMonth(index) ? "bg-primary text-primary-foreground" : ""}
                  ${isDisabledMonth(index) ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {month.substring(0, 3)}
              </Button>
            ))}
          </div>

          <div className="flex justify-end mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
