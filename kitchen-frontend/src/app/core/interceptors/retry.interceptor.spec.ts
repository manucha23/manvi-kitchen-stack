import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HTTP_INTERCEPTORS,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RetryInterceptor } from './retry.interceptor';
import { environment } from '../../../environments/environment';

describe('RetryInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const testUrl = `${environment.adminApiUrl}/admin/orders`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        {
          provide: HTTP_INTERCEPTORS,
          useClass: RetryInterceptor,
          multi: true,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('retries a 500 response once', () => {
    http.get(testUrl).subscribe({
      next: () => fail('should have failed'),
      error: () => undefined,
    });

    const first = httpMock.expectOne(testUrl);
    first.flush('Server error', { status: 500, statusText: 'Server Error' });

    const retry = httpMock.expectOne(testUrl);
    expect(retry.request.headers.get('X-Retry-Count')).toBe('1');
    retry.flush('Server error', { status: 500, statusText: 'Server Error' });
  });

  it('does not retry CORS / network failures (status 0)', () => {
    http.get(testUrl).subscribe({
      next: () => fail('should have failed'),
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(0);
      },
    });

    const request = httpMock.expectOne(testUrl);
    request.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    httpMock.expectNone(testUrl);
  });

  it('does not retry 404 responses', () => {
    http.get(testUrl).subscribe({
      next: () => fail('should have failed'),
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(404);
      },
    });

    const request = httpMock.expectOne(testUrl);
    request.flush('Not found', { status: 404, statusText: 'Not Found' });
    httpMock.expectNone(testUrl);
  });
});
