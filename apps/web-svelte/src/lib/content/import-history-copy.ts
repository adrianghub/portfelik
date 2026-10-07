import * as m from "$lib/paraglide/messages";

export const importHistoryCopy = {
  get title() {
    return m.import_history_title();
  },
  get introduction() {
    return m.import_history_introduction();
  },
  get empty() {
    return m.import_history_empty();
  },
  get loading() {
    return m.import_history_loading();
  },
  get error() {
    return m.import_history_error();
  },
  get rowsError() {
    return m.import_history_rows_error();
  },
  get loadingRows() {
    return m.import_history_loading_rows();
  },
  get retry() {
    return m.import_history_retry();
  },
  get back() {
    return m.import_history_back();
  },
  get newImport() {
    return m.import_history_new_import();
  },
  get periodTransactions() {
    return m.import_history_period_transactions();
  },
  get historyNotice() {
    return m.import_history_history_notice();
  },
  get unknownFile() {
    return m.import_history_unknown_file();
  },
  get added() {
    return m.import_history_added();
  },
  get skipped() {
    return m.import_history_skipped();
  },
  get duplicates() {
    return m.import_history_duplicates();
  },
  get operations() {
    return m.import_history_operations();
  },
  get period() {
    return m.import_history_period();
  },
  get importedOn() {
    return m.import_history_imported_on();
  },
};
