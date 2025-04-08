import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import utc from "dayjs/plugin/utc";
import {
  formatAmount,
  getTranslatedMessage,
  getTranslatedTitle,
  getUserLanguage,
} from "./translations";

dayjs.extend(utc);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

export {
  dayjs,
  formatAmount,
  getTranslatedMessage,
  getTranslatedTitle,
  getUserLanguage,
};
