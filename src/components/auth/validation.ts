/**
 * Validates an email address
 * @param email The email address to validate
 * @returns An error message if invalid, undefined if valid
 */
export const validateEmail = (email: string): string | undefined => {
  if (!email) {
    return "Email is required";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address";
  }
  return undefined;
};

/**
 * Validates a password
 * @param password The password to validate
 * @returns An error message if invalid, undefined if valid
 */
export const validatePassword = (password: string): string | undefined => {
  if (!password) {
    return "Password is required";
  }
  if (password.length < 6) {
    return "Password must be at least 6 characters";
  }
  return undefined;
};
