import { useContext } from "react";
import { CategoryContext, CategoryContextType } from "./CategoryContext";

export function useCategoriesContext(): CategoryContextType {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error("useCategories must be used within a CategoryProvider");
  }
  return context;
}
