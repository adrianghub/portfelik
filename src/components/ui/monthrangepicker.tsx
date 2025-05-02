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
    <div className={cn("min-w-[400px] p-3", className)} {...props}>
      <div className="flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0">
        <div className="w-full">
          <MonthRangeCal
            selectedMonthRange={selectedMonthRange}
            onMonthRangeSelect={onMonthRangeSelect}
            onStartMonthSelect={onStartMonthSelect}
            callbacks={callbacks}
            variant={variant}
            minDate={minDate}
            maxDate={maxDate}
            quickSelectors={quickSelectors}
            showQuickSelectors={showQuickSelectors}
            onYearBackward={onYearBackward}
            onYearForward={onYearForward}
          />
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
    <div className="flex flex-col md:flex-row gap-4">
      <div className="space-y-4 flex-shrink md:flex-1 md:min-w-[400px] min-w-auto">
        <div className="flex justify-between md:justify-evenly pt-1 relative items-center">
          <button
            onClick={() => {
              setMenuYear(menuYear - 1);
              if (onYearBackward) onYearBackward();
            }}
            className={cn(
              buttonVariants({ variant: variant?.chevrons ?? "outline" }),
              "inline-flex items-center justify-center h-7 w-7 p-0",
              "md:absolute md:left-1",
            )}
          >
            <ChevronLeft className="opacity-50 h-4 w-4" />
          </button>
          <div className="text-sm font-medium text-center flex-1 md:flex-initial md:text-left">
            {callbacks?.yearLabel ? callbacks?.yearLabel(menuYear) : menuYear}
          </div>
          <div className="text-sm font-medium hidden md:block">
            {callbacks?.yearLabel
              ? callbacks?.yearLabel(menuYear + 1)
              : menuYear + 1}
          </div>
          <button
            onClick={() => {
              setMenuYear(menuYear + 1);
              if (onYearForward) onYearForward();
            }}
            className={cn(
              buttonVariants({ variant: variant?.chevrons ?? "outline" }),
              "inline-flex items-center justify-center h-7 w-7 p-0",
              "md:absolute md:right-1",
            )}
          >
            <ChevronRight className="opacity-50 h-4 w-4" />
          </button>
        </div>
        <table className="w-full border-collapse space-y-1 hidden md:table">
          <tbody>
            {MONTHS.map((monthRow, a) => {
              return (
                <tr key={"row-md-" + a} className="flex w-full mt-2">
                  {monthRow.map((m, i) => {
                    const monthYear = menuYear + m.yearOffset;
                    const monthNumber = m.number;
                    const localizedMonthName = getShortMonthName(
                      monthYear,
                      monthNumber,
                    );

                    const currentDate = dayjs(new Date(monthYear, monthNumber));
                    const startDate = dayjs(new Date(startYear, startMonth));
                    const endDate = dayjs(new Date(endYear, endMonth));

                    const isCurrentMonthStart = currentDate.isSame(
                      startDate,
                      "month",
                    );
                    const isCurrentMonthEnd = currentDate.isSame(
                      endDate,
                      "month",
                    );

                    const isInSelectedRange =
                      (rangePending || endLocked) &&
                      currentDate.isBetween(startDate, endDate, "month", "[]");

                    const isSelectedFinal =
                      (isCurrentMonthStart || isCurrentMonthEnd) &&
                      !rangePending;

                    return (
                      <td
                        key={monthNumber + "-" + m.yearOffset + "-md"}
                        className={cn(
                          "h-10 w-1/4 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                          isInSelectedRange &&
                            "bg-accent text-accent-foreground",
                          isCurrentMonthStart &&
                            isInSelectedRange &&
                            "rounded-l-md",
                          isCurrentMonthEnd &&
                            isInSelectedRange &&
                            "rounded-r-md",
                          i == 3 ? "mr-2" : i == 4 ? "ml-2" : "",
                        )}
                        onMouseEnter={() => {
                          if (rangePending && !endLocked) {
                            const potentialEndDate = dayjs(
                              new Date(monthYear, monthNumber),
                            );
                            if (
                              !potentialEndDate.isBefore(startDate, "month")
                            ) {
                              setEndYear(monthYear);
                              setEndMonth(monthNumber);
                            }
                          }
                        }}
                      >
                        <button
                          onClick={() => {
                            const clickedDate = dayjs(
                              new Date(monthYear, monthNumber),
                            );
                            if (rangePending) {
                              if (clickedDate.isBefore(startDate, "month")) {
                                setRangePending(true);
                                setEndLocked(false);
                                setStartMonth(monthNumber);
                                setStartYear(monthYear);
                                setEndYear(monthYear);
                                setEndMonth(monthNumber);
                                if (onStartMonthSelect)
                                  onStartMonthSelect(clickedDate.toDate());
                              } else {
                                setRangePending(false);
                                setEndLocked(true);
                                const finalEndDate = clickedDate.isBefore(
                                  startDate,
                                  "month",
                                )
                                  ? startDate
                                  : clickedDate;
                                setEndYear(finalEndDate.year());
                                setEndMonth(finalEndDate.month());

                                if (onMonthRangeSelect) {
                                  onMonthRangeSelect({
                                    start: startDate.toDate(),
                                    end: finalEndDate.toDate(),
                                  });
                                }
                              }
                            } else {
                              setRangePending(true);
                              setEndLocked(false);
                              setStartMonth(monthNumber);
                              setStartYear(monthYear);
                              setEndYear(monthYear);
                              setEndMonth(monthNumber);
                              if (onStartMonthSelect)
                                onStartMonthSelect(clickedDate.toDate());
                            }
                          }}
                          disabled={
                            (maxDate &&
                              currentDate.isAfter(dayjs(maxDate), "month")) ||
                            (minDate &&
                              currentDate.isBefore(dayjs(minDate), "month"))
                          }
                          className={cn(
                            buttonVariants({
                              variant: isSelectedFinal
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

        <table className="w-full border-collapse space-y-1 md:hidden">
          <tbody>
            {[0, 1, 2, 3].map((rowIndex) => (
              <tr key={`row-sm-${rowIndex}`} className="flex w-full mt-2">
                {[0, 1, 2].map((colIndex) => {
                  const monthIndex = rowIndex * 3 + colIndex;
                  if (monthIndex > 11)
                    return (
                      <td key={`empty-${colIndex}`} className="w-1/3 p-1"></td>
                    );

                  const monthNumber = monthIndex;
                  const monthYear = menuYear;
                  const localizedMonthName = getShortMonthName(
                    monthYear,
                    monthNumber,
                  );

                  const currentDate = dayjs(new Date(monthYear, monthNumber));
                  const startDate = dayjs(new Date(startYear, startMonth));
                  const endDate = dayjs(new Date(endYear, endMonth));

                  const isCurrentMonthStart = currentDate.isSame(
                    startDate,
                    "month",
                  );
                  const isCurrentMonthEnd = currentDate.isSame(
                    endDate,
                    "month",
                  );

                  const isInSelectedRange =
                    (rangePending || endLocked) &&
                    currentDate.isBetween(startDate, endDate, "month", "[]");

                  const isSelectedFinal =
                    (isCurrentMonthStart || isCurrentMonthEnd) && !rangePending;

                  return (
                    <td
                      key={`${monthNumber}-${monthYear}-sm`}
                      className={cn(
                        "h-10 w-1/3 text-center text-sm p-1 relative focus-within:relative focus-within:z-20",
                        isInSelectedRange && "bg-accent text-accent-foreground",
                        isCurrentMonthStart &&
                          isInSelectedRange &&
                          "rounded-l-md",
                        isCurrentMonthEnd &&
                          isInSelectedRange &&
                          "rounded-r-md",
                      )}
                      onMouseEnter={() => {
                        if (rangePending && !endLocked) {
                          const potentialEndDate = dayjs(
                            new Date(menuYear, monthNumber),
                          );
                          if (!potentialEndDate.isBefore(startDate, "month")) {
                            setEndYear(menuYear);
                            setEndMonth(monthNumber);
                          }
                        }
                      }}
                    >
                      <button
                        onClick={() => {
                          const clickedDate = dayjs(
                            new Date(monthYear, monthNumber),
                          );
                          if (rangePending) {
                            if (clickedDate.isBefore(startDate, "month")) {
                              setRangePending(true);
                              setEndLocked(false);
                              setStartMonth(monthNumber);
                              setStartYear(monthYear);
                              setEndYear(monthYear);
                              setEndMonth(monthNumber);
                              if (onStartMonthSelect)
                                onStartMonthSelect(clickedDate.toDate());
                            } else {
                              setRangePending(false);
                              setEndLocked(true);
                              const finalEndDate = clickedDate.isBefore(
                                startDate,
                                "month",
                              )
                                ? startDate
                                : clickedDate;
                              setEndYear(finalEndDate.year());
                              setEndMonth(finalEndDate.month());

                              if (onMonthRangeSelect) {
                                onMonthRangeSelect({
                                  start: startDate.toDate(),
                                  end: finalEndDate.toDate(),
                                });
                              }
                            }
                          } else {
                            setRangePending(true);
                            setEndLocked(false);
                            setStartMonth(monthNumber);
                            setStartYear(monthYear);
                            setEndYear(monthYear);
                            setEndMonth(monthNumber);
                            if (onStartMonthSelect)
                              onStartMonthSelect(clickedDate.toDate());
                          }
                        }}
                        disabled={
                          (maxDate &&
                            currentDate.isAfter(dayjs(maxDate), "month")) ||
                          (minDate &&
                            currentDate.isBefore(dayjs(minDate), "month"))
                        }
                        className={cn(
                          buttonVariants({
                            variant: isSelectedFinal
                              ? (variant?.calendar?.selected ?? "default")
                              : (variant?.calendar?.main ?? "ghost"),
                          }),
                          "h-full w-full p-0 font-normal aria-selected:opacity-100",
                        )}
                      >
                        {localizedMonthName}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showQuickSelectors && (
        <div className="flex flex-col gap-2 md:max-w-[150px] flex-shrink-0">
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
