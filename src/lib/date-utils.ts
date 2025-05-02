import dayjs from "dayjs";

import customParseFormat from "dayjs/plugin/customParseFormat";
import isBetween from "dayjs/plugin/isBetween";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
dayjs.extend(customParseFormat);
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(utc);
dayjs.extend(relativeTime);

export const getFirstDayOfMonth = (date = dayjs()) => {
  return date.startOf("month");
};

export const getLastDayOfMonth = (date = dayjs()) => {
  return date.endOf("month");
};

export function getMonthNameWithYear(date: DayjsDate): string {
  const monthName = new Intl.DateTimeFormat("pl-PL", {
    month: "long",
  }).format(date.toDate());

  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${date.year()}`;
}

export const formatShortMonth = (date = dayjs()) => {
  return date.format("MMM");
};

export const formatDate = (date: string | Date | dayjs.Dayjs) => {
  return dayjs(date).format("YYYY-MM-DD");
};

export const formatDateToISOString = (date: string | Date | dayjs.Dayjs) => {
  return dayjs(date).toISOString();
};

export const formatDisplayDate = (date: string | Date | dayjs.Dayjs) => {
  return dayjs(date).format("DD MMM YYYY");
};

export const isDateInRange = (
  date: string | Date | dayjs.Dayjs,
  startDate: string | Date | dayjs.Dayjs,
  endDate: string | Date | dayjs.Dayjs,
) => {
  return dayjs(date).isBetween(startDate, endDate, "day", "[]");
};

export const getCurrentMonth = () => {
  return dayjs().month();
};

export const getCurrentYear = () => {
  return dayjs().year();
};

export type DayjsDate = dayjs.Dayjs;

export default dayjs;
