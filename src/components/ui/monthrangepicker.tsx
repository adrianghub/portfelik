import dayjs from "@/lib/date-utils";
import { cn } from "@/lib/styling-utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "./button";

const addMonths = (input: Date, months: number) => {
  const date = new Date(input);
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  date.setDate(
    Math.min(
      input.getDate(),
      getDaysInMonth(date.getFullYear(), date.getMonth() + 1),
    ),
  );
  return date;
};
const getDaysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

type Month = {
  number: number;
  name: string;
  yearOffset: number;
};

const MONTHS: Omit<Month, "name">[][] = [
  [
    { number: 0, yearOffset: 0 },
    { number: 1, yearOffset: 0 },
    { number: 2, yearOffset: 0 },
    { number: 3, yearOffset: 0 },
    { number: 0, yearOffset: 1 },
    { number: 1, yearOffset: 1 },
    { number: 2, yearOffset: 1 },
    { number: 3, yearOffset: 1 },
  ],
  [
    { number: 4, yearOffset: 0 },
    { number: 5, yearOffset: 0 },
    { number: 6, yearOffset: 0 },
    { number: 7, yearOffset: 0 },
    { number: 4, yearOffset: 1 },
    { number: 5, yearOffset: 1 },
    { number: 6, yearOffset: 1 },
    { number: 7, yearOffset: 1 },
  ],
  [
    { number: 8, yearOffset: 0 },
    { number: 9, yearOffset: 0 },
    { number: 10, yearOffset: 0 },
    { number: 11, yearOffset: 0 },
    { number: 8, yearOffset: 1 },
    { number: 9, yearOffset: 1 },
    { number: 10, yearOffset: 1 },
    { number: 11, yearOffset: 1 },
  ],
];

type QuickSelector = {
  key: string;
  startMonth: Date;
  endMonth: Date;
  variant?: ButtonVariant;
  onClick?: (selector: QuickSelector) => void;
};

const getQuickSelectors = (): Omit<QuickSelector, "label">[] => [
  {
    key: "common.date.thisYear",
    startMonth: new Date(new Date().getFullYear(), 0),
    endMonth: new Date(new Date().getFullYear(), 11),
  },
  {
    key: "common.date.lastYear",
    startMonth: new Date(new Date().getFullYear() - 1, 0),
    endMonth: new Date(new Date().getFullYear() - 1, 11),
  },
  {
    key: "common.date.last6Months",
    startMonth: new Date(addMonths(new Date(), -6)),
    endMonth: new Date(),
  },
  {
    key: "common.date.last12Months",
    startMonth: new Date(addMonths(new Date(), -12)),
    endMonth: new Date(),
  },
];

type MonthRangeCalProps = {
  selectedMonthRange?: { start: Date; end: Date };
  onStartMonthSelect?: (date: Date) => void;
  onMonthRangeSelect?: ({ start, end }: { start: Date; end: Date }) => void;
  onYearForward?: () => void;
  onYearBackward?: () => void;
  callbacks?: {
    yearLabel?: (year: number) => string;
    monthLabel?: (month: Month) => string;
  };
  variant?: {
    calendar?: {
      main?: ButtonVariant;
      selected?: ButtonVariant;
    };
    chevrons?: ButtonVariant;
  };
  minDate?: Date;
  maxDate?: Date;
  quickSelectors?: QuickSelector[];
  showQuickSelectors?: boolean;
};

type ButtonVariant =
  | "default"
  | "outline"
  | "ghost"
  | "link"
  | "destructive"
  | "secondary"
  | null
  | undefined;

function MonthRangePicker({
  onMonthRangeSelect,
  onStartMonthSelect,
  callbacks,
  selectedMonthRange,
  onYearBackward,
  onYearForward,
  variant,
  minDate,
  maxDate,
  quickSelectors,
  showQuickSelectors,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & MonthRangeCalProps) {
  return (
    <div className={cn("min-w-[400px]  p-3", className)} {...props}>
      <div className="flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0">
        <div className="w-full">
          <MonthRangeCal
            onMonthRangeSelect={onMonthRangeSelect}
            onStartMonthSelect={onStartMonthSelect}
            callbacks={callbacks}
            selectedMonthRange={selectedMonthRange}
            onYearBackward={onYearBackward}
            onYearForward={onYearForward}
            variant={variant}
            minDate={minDate}
            maxDate={maxDate}
            quickSelectors={quickSelectors}
            showQuickSelectors={showQuickSelectors}
          ></MonthRangeCal>
        </div>
      </div>
    </div>
  );
}

function MonthRangeCal({
  selectedMonthRange,
  onMonthRangeSelect,
  onStartMonthSelect,
  callbacks,
  variant,
  minDate,
  maxDate,
  quickSelectors: customQuickSelectors,
  showQuickSelectors = true,
  onYearBackward,
  onYearForward,
}: MonthRangeCalProps) {
  const { t, i18n } = useTranslation();
  const currentLocale = i18n.language;

  const quickSelectors = customQuickSelectors || getQuickSelectors();

  const [startYear, setStartYear] = React.useState<number>(
    selectedMonthRange?.start.getFullYear() ?? new Date().getFullYear(),
  );
  const [startMonth, setStartMonth] = React.useState<number>(
    selectedMonthRange?.start?.getMonth() ?? new Date().getMonth(),
  );
  const [endYear, setEndYear] = React.useState<number>(
    selectedMonthRange?.end?.getFullYear() ?? new Date().getFullYear(),
  );
  const [endMonth, setEndMonth] = React.useState<number>(
    selectedMonthRange?.end?.getMonth() ?? new Date().getMonth(),
  );
  const [rangePending, setRangePending] = React.useState<boolean>(false);
  const [endLocked, setEndLocked] = React.useState<boolean>(true);
  const [menuYear, setMenuYear] = React.useState<number>(startYear);

  if (minDate && maxDate && minDate > maxDate) minDate = maxDate;

  const currentMonthStart = dayjs().startOf("month").toDate();
  const currentMonthEnd = dayjs().endOf("month").toDate();

  const isCurrentMonthSelected =
    selectedMonthRange &&
    dayjs(selectedMonthRange.start).isSame(currentMonthStart, "month") &&
    dayjs(selectedMonthRange.end).isSame(currentMonthEnd, "month");

  const handleSelectCurrentMonth = () => {
    const now = new Date();
    const currentMonthStartDate = dayjs(now).startOf("month").toDate();
    const currentMonthEndDate = dayjs(now).endOf("month").toDate();

    setStartYear(currentMonthStartDate.getFullYear());
    setEndYear(currentMonthEndDate.getFullYear());
    setStartMonth(currentMonthStartDate.getMonth());
    setEndMonth(currentMonthEndDate.getMonth());
    setMenuYear(currentMonthStartDate.getFullYear());
    setRangePending(false);
    setEndLocked(true);
    if (onMonthRangeSelect) {
      onMonthRangeSelect({
        start: currentMonthStartDate,
        end: currentMonthEndDate,
      });
    }
  };

  const getShortMonthName = (year: number, monthNumber: number): string => {
    const date = new Date(year, monthNumber);

    const monthName = new Intl.DateTimeFormat(currentLocale, {
      month: "short",
    }).format(date);
    return monthName.charAt(0).toUpperCase() + monthName.slice(1);
  };

  return (
    <div className="flex gap-4">
      <div className="min-w-[400px] space-y-4">
        <div className="flex justify-evenly pt-1 relative items-center">
          <div className="text-sm font-medium">
            {callbacks?.yearLabel ? callbacks?.yearLabel(menuYear) : menuYear}
          </div>
          <div className="space-x-1 flex items-center">
            <button
              onClick={() => {
                setMenuYear(menuYear - 1);
                if (onYearBackward) onYearBackward();
              }}
              className={cn(
                buttonVariants({ variant: variant?.chevrons ?? "outline" }),
                "inline-flex items-center justify-center h-7 w-7 p-0 absolute left-1",
              )}
            >
              <ChevronLeft className="opacity-50 h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setMenuYear(menuYear + 1);
                if (onYearForward) onYearForward();
              }}
              className={cn(
                buttonVariants({ variant: variant?.chevrons ?? "outline" }),
                "inline-flex items-center justify-center h-7 w-7 p-0 absolute right-1",
              )}
            >
              <ChevronRight className="opacity-50 h-4 w-4" />
            </button>
          </div>
          <div className="text-sm font-medium">
            {callbacks?.yearLabel
              ? callbacks?.yearLabel(menuYear + 1)
              : menuYear + 1}
          </div>
        </div>
        <table className="w-full border-collapse space-y-1">
          <tbody>
            {MONTHS.map((monthRow, a) => {
              return (
                <tr key={"row-" + a} className="flex w-full mt-2">
                  {monthRow.map((m, i) => {
                    const monthYear = menuYear + m.yearOffset;
                    const monthNumber = m.number;
                    const localizedMonthName = getShortMonthName(
                      monthYear,
                      monthNumber,
                    );

                    return (
                      <td
                        key={monthNumber + "-" + m.yearOffset}
                        className={cn(
                          cn(
                            cn(
                              cn(
                                "h-10 w-1/4 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                                (menuYear + m.yearOffset > startYear ||
                                  (menuYear + m.yearOffset == startYear &&
                                    m.number > startMonth)) &&
                                  (menuYear + m.yearOffset < endYear ||
                                    (menuYear + m.yearOffset == endYear &&
                                      m.number < endMonth)) &&
                                  (rangePending || endLocked)
                                  ? "text-accent-foreground bg-accent"
                                  : "",
                              ),
                              menuYear + m.yearOffset == startYear &&
                                m.number == startMonth &&
                                (rangePending || endLocked)
                                ? "text-accent-foreground bg-accent rounded-l-md"
                                : "",
                            ),
                            menuYear + m.yearOffset == endYear &&
                              m.number == endMonth &&
                              (rangePending || endLocked) &&
                              menuYear + m.yearOffset >= startYear &&
                              m.number >= startMonth
                              ? "text-accent-foreground bg-accent rounded-r-md"
                              : "",
                          ),
                          i == 3 ? "mr-2" : i == 4 ? "ml-2" : "",
                        )}
                        onMouseEnter={() => {
                          if (rangePending && !endLocked) {
                            setEndYear(menuYear + m.yearOffset);
                            setEndMonth(m.number);
                          }
                        }}
                      >
                        <button
                          onClick={() => {
                            if (rangePending) {
                              if (
                                menuYear + m.yearOffset < startYear ||
                                (menuYear + m.yearOffset == startYear &&
                                  m.number < startMonth)
                              ) {
                                setRangePending(true);
                                setEndLocked(false);
                                setStartMonth(m.number);
                                setStartYear(menuYear + m.yearOffset);
                                setEndYear(menuYear + m.yearOffset);
                                setEndMonth(m.number);
                                if (onStartMonthSelect)
                                  onStartMonthSelect(
                                    new Date(menuYear + m.yearOffset, m.number),
                                  );
                              } else {
                                setRangePending(false);
                                setEndLocked(true);
                                // Event fire data selected

                                if (onMonthRangeSelect)
                                  onMonthRangeSelect({
                                    start: new Date(startYear, startMonth),
                                    end: new Date(
                                      menuYear + m.yearOffset,
                                      m.number,
                                    ),
                                  });
                              }
                            } else {
                              setRangePending(true);
                              setEndLocked(false);
                              setStartMonth(m.number);
                              setStartYear(menuYear + m.yearOffset);
                              setEndYear(menuYear + m.yearOffset);
                              setEndMonth(m.number);
                              if (onStartMonthSelect)
                                onStartMonthSelect(
                                  new Date(menuYear + m.yearOffset, m.number),
                                );
                            }
                          }}
                          disabled={
                            (maxDate
                              ? menuYear + m.yearOffset >
                                  maxDate?.getFullYear() ||
                                (menuYear + m.yearOffset ==
                                  maxDate?.getFullYear() &&
                                  m.number > maxDate.getMonth())
                              : false) ||
                            (minDate
                              ? menuYear + m.yearOffset <
                                  minDate?.getFullYear() ||
                                (menuYear + m.yearOffset ==
                                  minDate?.getFullYear() &&
                                  m.number < minDate.getMonth())
                              : false)
                          }
                          className={cn(
                            buttonVariants({
                              variant:
                                (startMonth == m.number &&
                                  menuYear + m.yearOffset == startYear) ||
                                (endMonth == m.number &&
                                  menuYear + m.yearOffset == endYear &&
                                  !rangePending)
                                  ? (variant?.calendar?.selected ?? "default")
                                  : (variant?.calendar?.main ?? "ghost"),
                            }),
                            "h-full w-full p-0 font-normal aria-selected:opacity-100",
                          )}
                        >
                          {callbacks?.monthLabel
                            ? callbacks.monthLabel({
                                ...m,
                                name: localizedMonthName,
                              } as Month)
                            : localizedMonthName}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showQuickSelectors && (
        <div className="flex flex-col gap-2 max-w-[150px]">
          <Button
            size="sm"
            variant={variant?.calendar?.main ?? "outline"}
            onClick={handleSelectCurrentMonth}
            disabled={isCurrentMonthSelected ?? false}
          >
            {t("common.date.currentMonth")}
          </Button>
          <hr className="my-1" />
          {quickSelectors.map((selector, i) => {
            const isDisabled = minDate
              ? dayjs(selector.startMonth).isBefore(dayjs(minDate))
              : false;
            return (
              <Button
                key={selector.key + i}
                size="sm"
                disabled={isDisabled}
                variant={
                  selector.variant ?? variant?.calendar?.main ?? "outline"
                }
                onClick={() => {
                  setStartYear(selector.startMonth.getFullYear());
                  setEndYear(selector.endMonth.getFullYear());
                  setStartMonth(selector.startMonth.getMonth());
                  setEndMonth(selector.endMonth.getMonth());
                  setMenuYear(selector.startMonth.getFullYear());
                  setRangePending(false);
                  setEndLocked(true);
                  if (onMonthRangeSelect)
                    onMonthRangeSelect({
                      start: selector.startMonth,
                      end: selector.endMonth,
                    });
                  if (selector.onClick) selector.onClick(selector);
                }}
              >
                {t(selector.key)}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

MonthRangePicker.displayName = "MonthRangePicker";

export { MonthRangePicker };
