import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance =
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,

        retry: (failureCount, error) => {
          const status =
            error?.response?.status ??
            error?.status ??
            error?.statusCode;

          if (status === 429) {
            return false;
          }

          return failureCount < 1;
        },
      },
    },
  });