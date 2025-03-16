import dayjs from "dayjs";

import customParseFormat from "dayjs/plugin/customParseFormat";
import isBetween from "dayjs/plugin/isBetween";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";

dayjs.extend(customParseFormat);
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

export const getFirstDayOfMonth = (date = dayjs()) => {
  return date.startOf("month");
};

export const getLastDayOfMonth = (date = dayjs()) => {
  return date.endOf("month");
};

export const formatMonth = (date = dayjs()) => {
  return date.format("MMMM YYYY");
};

export const formatShortMonth = (date = dayjs()) => {
  return date.format("MMM");
};

export const formatDate = (date: string | Date | dayjs.Dayjs) => {
  return dayjs(date).format("YYYY-MM-DD");
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
