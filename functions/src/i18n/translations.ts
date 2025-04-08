import * as admin from "firebase-admin";

/**
 * Translations for notification messages
 */

export interface Translation {
  title?: {
    pl: string;
  };
  body?: {
    pl: string;
  };
}

export const translations: Record<string, Translation> = {
  transaction_upcoming: {
    title: {
      pl: "Nowa nadchodząca transakcja",
    },
    body: {
      pl: 'Powtarzająca się transakcja "{description}" na kwotę {amount} została zaplanowana na dzień {date}.',
    },
  },
  transaction_overdue: {
    title: {
      pl: "Zaległa transakcja",
    },
    body: {
      pl: 'Transakcja "{description}" na kwotę {amount} jest teraz zaległa.',
    },
  },
  transaction_reminder_today: {
    title: {
      pl: "Transakcja do zapłaty dzisiaj",
    },
    body: {
      pl: 'Transakcja "{description}" na kwotę {amount} jest do zapłaty dzisiaj.',
    },
  },
  transaction_reminder_tomorrow: {
    title: {
      pl: "Transakcja do zapłaty jutro",
    },
    body: {
      pl: 'Transakcja "{description}" na kwotę {amount} jest do zapłaty jutro.',
    },
  },
  admin_transaction_summary: {
    title: {
      pl: "Podsumowanie transakcji",
    },
  },
  admin_transaction_summary_header: {
    body: {
      pl: "Aktywność platformy z dnia {date}:\nUżytkownicy z transakcjami: {userCount}\nŁącznie transakcji: {transactionCount}\nŁączny przychód: {totalIncome}\nŁączne wydatki: {totalExpenses}\n\n",
    },
  },
  admin_transaction_summary_all_users: {
    body: {
      pl: "Podsumowanie użytkowników:",
    },
  },
  admin_transaction_summary_top_users: {
    body: {
      pl: "Top {count} użytkowników według liczby transakcji:",
    },
  },
  admin_transaction_summary_user_row: {
    body: {
      pl: "- {email}: {transactionCount} transakcji, Przychód: {income}, Wydatki: {expenses}",
    },
  },
  group_invitation: {
    title: {
      pl: "Nowe zaproszenie do grupy",
    },
    body: {
      pl: '{inviterName} zaprosił(a) Cię do dołączenia do grupy "{groupName}"',
    },
  },
  recurring_transaction_created: {
    title: {
      pl: "Nowa powtarzająca się transakcja",
    },
    body: {
      pl: 'Transakcja "{description}" na kwotę {amount} została zaplanowana na dzień {date}.',
    },
  },
};

/**
 * Gets a translated message with placeholders replaced by actual values
 */
export function getTranslatedMessage(
  key: string,
  language: string,
  params: Record<string, string | number> = {},
): string {
  const translation = translations[key];
  if (!translation) return "";

  let message =
    translation.body?.[language as keyof typeof translation.body] ||
    translation.body?.pl;

  Object.entries(params).forEach(([key, value]) => {
    message = message?.replace(`{${key}}`, String(value));
  });

  return message || "";
}

/**
 * Gets a translated title
 */
export function getTranslatedTitle(key: string, language: string): string {
  const translation = translations[key];
  if (!translation) return "";

  return (
    translation.title?.[language as keyof typeof translation.title] ||
    translation.title?.pl ||
    ""
  );
}

/**
 * Formats currency amount according to locale
 */
export function formatAmount(amount: number, language: string): string {
  return new Intl.NumberFormat(language === "pl" ? "pl-PL" : "en-US", {
    style: "currency",
    currency: "PLN",
  }).format(amount);
}

/**
 * Gets user language preference from user document or defaults to 'pl'
 */
export async function getUserLanguage(userId: string): Promise<string> {
  try {
    if (!userId) return "pl";

    const db = admin.firestore();

    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      return userData?.settings?.language || "pl";
    }
    return "pl";
  } catch (error) {
    console.warn("Error getting user language:", error);
    return "pl";
  }
}
