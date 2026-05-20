import { OeAccountApiService } from './../services/oe-energy.service';
// auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
} from '@angular/common/http';
import { Observable, throwError, switchMap } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';
import { catchError } from 'rxjs/operators';
import { OeStateService } from '../services/state.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private oeAccountApiService: OeAccountApiService,
    private oeStateService: OeStateService,
    private cookieService: CookieService
  ) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    const isApiV1 = request.url.includes('api/v1');
    const isApiV2 = request.url.includes('api/v2');
    const isAuthExempt =
      request.url.includes('/api/v1/account/register') ||
      request.url.includes('/api/v2/account/login');

    if ((!isApiV1 && !isApiV2) || isAuthExempt) {
      return next.handle(request).pipe(
        catchError((error) => {
          // Global error handling can be done here
          return throwError(() => error);
        })
      );
    }

    // Check if we already have an account token
    if (this.cookieService.check('accountToken')) {
      request = this.addToken(request, this.cookieService.get('accountToken'));
      return next.handle(request);
    }
    // No token found, so register and retry the request
    return this.oeAccountApiService.$register().pipe(
      switchMap((data) => {
        // Save the new token
        this.oeAccountApiService.$saveToken(data.accountToken);
        // Updating accountToken and accountSecret
        this.oeStateService.updateAccountSecret(data.accountSecret);
        this.oeStateService.updateAccountToken(data.accountToken);
        // Update token state if needed
        this.oeStateService.updateAccountTokenState('generated');
        this.oeStateService.showAccountURLWarning(true);
        // Clone the request and add the new token
        request = this.addToken(request, data.accountToken);
        return next.handle(request);
      })
    );
  }

  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    const body = request.body;
    const cloneRequest = request.clone({
      setHeaders: {
        Authorization: `${token}`,
      },
      body,
    });
    return cloneRequest;
  }
}
