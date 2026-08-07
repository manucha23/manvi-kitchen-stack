import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

const MAX_RETRIES = 1;
const RETRY_COUNT_HEADER = 'X-Retry-Count';

/** Failures that may succeed on a single retry (transient server / rate-limit). */
function isRetriable(error: HttpErrorResponse): boolean {
  if (error.status === 0) {
    // CORS, network offline, or aborted — retry will not help.
    return false;
  }
  if (error.status >= 500) {
    return true;
  }
  return error.status === 408 || error.status === 429;
}

@Injectable()
export class RetryInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler) {
    const isApiRequest =
      req.url.startsWith(environment.apiUrl) ||
      req.url.startsWith(environment.adminApiUrl);

    if (!isApiRequest) {
      return next.handle(req);
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        const retryCount = Number(req.headers.get(RETRY_COUNT_HEADER) || '0');

        if (retryCount >= MAX_RETRIES || !isRetriable(error)) {
          return throwError(() => error);
        }

        const retryReq = req.clone({
          setHeaders: { [RETRY_COUNT_HEADER]: String(retryCount + 1) },
        });

        return next.handle(retryReq);
      }),
    );
  }
}
