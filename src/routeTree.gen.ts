/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as TransactionsImport } from './routes/transactions'
import { Route as LoginImport } from './routes/login'
import { Route as IndexImport } from './routes/index'
import { Route as ShoppingListsIndexImport } from './routes/shopping-lists/index'
import { Route as AdminIndexImport } from './routes/admin/index'
import { Route as ShoppingListsIdImport } from './routes/shopping-lists/$id'
import { Route as AdminNotificationsImport } from './routes/admin/notifications'
import { Route as AdminCategoriesImport } from './routes/admin/categories'

// Create/Update Routes

const TransactionsRoute = TransactionsImport.update({
  id: '/transactions',
  path: '/transactions',
  getParentRoute: () => rootRoute,
} as any)

const LoginRoute = LoginImport.update({
  id: '/login',
  path: '/login',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const ShoppingListsIndexRoute = ShoppingListsIndexImport.update({
  id: '/shopping-lists/',
  path: '/shopping-lists/',
  getParentRoute: () => rootRoute,
} as any)

const AdminIndexRoute = AdminIndexImport.update({
  id: '/admin/',
  path: '/admin/',
  getParentRoute: () => rootRoute,
} as any)

const ShoppingListsIdRoute = ShoppingListsIdImport.update({
  id: '/shopping-lists/$id',
  path: '/shopping-lists/$id',
  getParentRoute: () => rootRoute,
} as any)

const AdminNotificationsRoute = AdminNotificationsImport.update({
  id: '/admin/notifications',
  path: '/admin/notifications',
  getParentRoute: () => rootRoute,
} as any)

const AdminCategoriesRoute = AdminCategoriesImport.update({
  id: '/admin/categories',
  path: '/admin/categories',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/login': {
      id: '/login'
      path: '/login'
      fullPath: '/login'
      preLoaderRoute: typeof LoginImport
      parentRoute: typeof rootRoute
    }
    '/transactions': {
      id: '/transactions'
      path: '/transactions'
      fullPath: '/transactions'
      preLoaderRoute: typeof TransactionsImport
      parentRoute: typeof rootRoute
    }
    '/admin/categories': {
      id: '/admin/categories'
      path: '/admin/categories'
      fullPath: '/admin/categories'
      preLoaderRoute: typeof AdminCategoriesImport
      parentRoute: typeof rootRoute
    }
    '/admin/notifications': {
      id: '/admin/notifications'
      path: '/admin/notifications'
      fullPath: '/admin/notifications'
      preLoaderRoute: typeof AdminNotificationsImport
      parentRoute: typeof rootRoute
    }
    '/shopping-lists/$id': {
      id: '/shopping-lists/$id'
      path: '/shopping-lists/$id'
      fullPath: '/shopping-lists/$id'
      preLoaderRoute: typeof ShoppingListsIdImport
      parentRoute: typeof rootRoute
    }
    '/admin/': {
      id: '/admin/'
      path: '/admin'
      fullPath: '/admin'
      preLoaderRoute: typeof AdminIndexImport
      parentRoute: typeof rootRoute
    }
    '/shopping-lists/': {
      id: '/shopping-lists/'
      path: '/shopping-lists'
      fullPath: '/shopping-lists'
      preLoaderRoute: typeof ShoppingListsIndexImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/transactions': typeof TransactionsRoute
  '/admin/categories': typeof AdminCategoriesRoute
  '/admin/notifications': typeof AdminNotificationsRoute
  '/shopping-lists/$id': typeof ShoppingListsIdRoute
  '/admin': typeof AdminIndexRoute
  '/shopping-lists': typeof ShoppingListsIndexRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/transactions': typeof TransactionsRoute
  '/admin/categories': typeof AdminCategoriesRoute
  '/admin/notifications': typeof AdminNotificationsRoute
  '/shopping-lists/$id': typeof ShoppingListsIdRoute
  '/admin': typeof AdminIndexRoute
  '/shopping-lists': typeof ShoppingListsIndexRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/transactions': typeof TransactionsRoute
  '/admin/categories': typeof AdminCategoriesRoute
  '/admin/notifications': typeof AdminNotificationsRoute
  '/shopping-lists/$id': typeof ShoppingListsIdRoute
  '/admin/': typeof AdminIndexRoute
  '/shopping-lists/': typeof ShoppingListsIndexRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | '/login'
    | '/transactions'
    | '/admin/categories'
    | '/admin/notifications'
    | '/shopping-lists/$id'
    | '/admin'
    | '/shopping-lists'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | '/login'
    | '/transactions'
    | '/admin/categories'
    | '/admin/notifications'
    | '/shopping-lists/$id'
    | '/admin'
    | '/shopping-lists'
  id:
    | '__root__'
    | '/'
    | '/login'
    | '/transactions'
    | '/admin/categories'
    | '/admin/notifications'
    | '/shopping-lists/$id'
    | '/admin/'
    | '/shopping-lists/'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  LoginRoute: typeof LoginRoute
  TransactionsRoute: typeof TransactionsRoute
  AdminCategoriesRoute: typeof AdminCategoriesRoute
  AdminNotificationsRoute: typeof AdminNotificationsRoute
  ShoppingListsIdRoute: typeof ShoppingListsIdRoute
  AdminIndexRoute: typeof AdminIndexRoute
  ShoppingListsIndexRoute: typeof ShoppingListsIndexRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  LoginRoute: LoginRoute,
  TransactionsRoute: TransactionsRoute,
  AdminCategoriesRoute: AdminCategoriesRoute,
  AdminNotificationsRoute: AdminNotificationsRoute,
  ShoppingListsIdRoute: ShoppingListsIdRoute,
  AdminIndexRoute: AdminIndexRoute,
  ShoppingListsIndexRoute: ShoppingListsIndexRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/login",
        "/transactions",
        "/admin/categories",
        "/admin/notifications",
        "/shopping-lists/$id",
        "/admin/",
        "/shopping-lists/"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/login": {
      "filePath": "login.tsx"
    },
    "/transactions": {
      "filePath": "transactions.tsx"
    },
    "/admin/categories": {
      "filePath": "admin/categories.tsx"
    },
    "/admin/notifications": {
      "filePath": "admin/notifications.tsx"
    },
    "/shopping-lists/$id": {
      "filePath": "shopping-lists/$id.tsx"
    },
    "/admin/": {
      "filePath": "admin/index.tsx"
    },
    "/shopping-lists/": {
      "filePath": "shopping-lists/index.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
