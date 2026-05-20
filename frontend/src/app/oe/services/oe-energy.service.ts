import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, throwError, of } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  BlockHeader,
  SwaggerJson,
  BackendGitHash,
  BlockSpanHeaders,
  RegisterResult,
  LoginResult,
  EitherBlockSpansResponse,
} from '../interfaces/oe-energy.interface';
import { tap, shareReplay, catchError, map } from 'rxjs/operators';
import { OeStateService } from './state.service';
import { CookieService } from 'ngx-cookie-service';
import { getEmptyBlockHeader } from '../utils/helper';

@Injectable({
  providedIn: 'root',
})
export class OeEnergyApiService {
  private apiBaseUrl: string; // base URL is protocol, hostname, and port
  private apiBasePath: string; // network path is /testnet, etc. or '' for mainnet
  constructor(
    private httpClient: HttpClient,
    private oeEnergyStateService: OeStateService
  ) {
    this.apiBaseUrl =
      document.location.protocol + '//' + document.location.host; // use relative URL by default
    this.apiBasePath = '';
  }

  $getBlockByHeight(height: number): Observable<BlockHeader> {
    return this.httpClient.get<BlockHeader>(
      `${this.apiBaseUrl}${this.apiBasePath}/api/v2/blockspans/blockbyheight/${height}`
    );
  }

  $getBlocksByHeights(heights: number[]): Observable<BlockHeader[]> {
    const startHeight = heights[0];
    const endHeight = heights[heights.length - 1];
    const spanSize = endHeight - startHeight;
    const tipHeight = this.oeEnergyStateService.latestReceivedBlockHeight;

    if (endHeight > tipHeight && tipHeight > 0) {
      return this.httpClient.get<{ startBlock: BlockHeader; endBlock: BlockHeader }>(
        `${this.apiBaseUrl}${this.apiBasePath}/api/v2/blockspans/blockspan/${startHeight}?spanSize=${spanSize}`
      ).pipe(
        map(response => [response.endBlock, getEmptyBlockHeader(endHeight)]),
        catchError(() => of(heights.map(h => getEmptyBlockHeader(h))))
      );
    }

    return this.httpClient.get<{ startBlock: BlockHeader; endBlock: BlockHeader }>(
      `${this.apiBaseUrl}${this.apiBasePath}/api/v2/blockspans/blockspan/${endHeight}?spanSize=${spanSize}`
    ).pipe(
      map(response => [response.startBlock, response.endBlock]),
      catchError(() => of(heights.map(h => getEmptyBlockHeader(h))))
    );
  }

  // returns swagger API json
  $getSwaggerFile(): Observable<SwaggerJson> {
    return this.httpClient.get<SwaggerJson>(
      this.apiBaseUrl + this.apiBasePath + '/api/v1/swagger.json',
      {}
    );
  }

  $getGitHash(): Observable<BackendGitHash> {
    return this.httpClient.get<BackendGitHash>(
      `${this.apiBaseUrl}${this.apiBasePath}/api/v2/blockspans/git-hash`
    );
  }

  $getBlocksByBlockSpan(
    startBlockHeight: number,
    span: number,
    mNumberOfSpan?: number
  ): Observable<BlockSpanHeaders[]> {
    let queryParam = typeof mNumberOfSpan !== 'undefined'
      ? `?numberOfSpans=${mNumberOfSpan}&withHeaders=true`
      : '?withHeaders=true';
    return this.httpClient.get<EitherBlockSpansResponse>(
      `${this.apiBaseUrl}${this.apiBasePath}/api/v2/blockspans/blockspans/${startBlockHeight}/${span}${queryParam}`
    ).pipe(
      map((response: EitherBlockSpansResponse) => response.Right || [])
    );
  }

}

@Injectable({
  providedIn: 'root',
})
export class OeAccountApiService {
  private apiBaseUrl: string; // base URL is protocol, hostname, and port
  private apiBasePath: string; // network path is /testnet, etc. or '' for mainnet
  private registrationInProgress: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  private registrationObservable: Observable<any> | null = null;
  constructor(
    private httpClient: HttpClient,
    private cookieService: CookieService
  ) {
    this.apiBaseUrl =
      document.location.protocol + '//' + document.location.host; // use relative URL by default
    this.apiBasePath = '';
  }

  // registers new user. See API specs for reference
  // it is expected that frontend should keep token in the state service and use it for the rest API calls,
  // that require authentication.
  $register(): Observable<RegisterResult> {
    if (!this.registrationObservable) {
      this.registrationInProgress.next(true);
      this.registrationObservable = this.httpClient
        .post<RegisterResult>(
          this.apiBaseUrl + this.apiBasePath + '/api/v1/account/register',
          {}
        )
        .pipe(
          tap((data) => {
            this.$saveToken(data.accountToken);
            this.$saveAccountUUID(data.personUUID);
            this.registrationInProgress.next(false);
          }),
          shareReplay(1),
          catchError((error) => {
            this.registrationInProgress.next(false);
            this.registrationObservable = null; // Reset for future attempts
            return throwError(() => new Error(`Registration failed: ${error}`));
          })
        );
    }
    return this.registrationObservable;
  }

  // logs in user with given secret. returns account token. See API for reference
  // it is expected that frontend should keep token in the state service and use it for the rest API calls,
  // that require authentication.
  // params:
  // - secret: secret value returned by $register() call
  $login(secret: string): Observable<LoginResult> {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.httpClient.post<LoginResult>(
      this.apiBaseUrl + this.apiBasePath + '/api/v2/account/login',
      JSON.stringify(secret),
      {
        observe: 'body',
        responseType: 'json',
        headers,
      }
    );
  }

  // returns swagger API json
  $getSwaggerFile(): Observable<SwaggerJson> {
    return this.httpClient.get<SwaggerJson>(
      this.apiBaseUrl + this.apiBasePath + '/api/v1/account/swagger.json',
      {}
    );
  }

  // returns swagger API json
  $getGitHash(): Observable<BackendGitHash> {
    return this.httpClient.get<BackendGitHash>(
      this.apiBaseUrl + this.apiBasePath + '/api/v1/account/git-hash',
      {}
    );
  }
  $cleanToken(): void {
    this.cookieService.delete('accountToken');
  }

  $saveToken(token: string): void {
    this.cookieService.set('accountToken', token, undefined, '/');
  }

  $saveAccountUUID(accountUUID: string): void {
    this.cookieService.set('accountUUID', accountUUID , undefined, '/');
  }

  $tokenExists(): boolean {
    return this.cookieService.check('accountToken');
  }

  $getAccountToken(): string {
    return this.cookieService.get('accountToken');
  }

  $getAccountUUID(): string {
    return this.cookieService.get('accountUUID');
  }
}

@Injectable({
  providedIn: 'root',
})
export class OeBlocktimeApiService {
  private apiBaseUrl: string;
  private apiBasePath: string;

  constructor(private httpClient: HttpClient) {
    this.apiBaseUrl =
      document.location.protocol + '//' + document.location.host;
    this.apiBasePath = '';
  }

  $getSwaggerFile(): Observable<SwaggerJson> {
    return this.httpClient.get<SwaggerJson>(
      this.apiBaseUrl + this.apiBasePath + '/api/v1/blocktime/swagger.json',
      {}
    );
  }

  $getGitHash(): Observable<BackendGitHash> {
    return this.httpClient.get<BackendGitHash>(
      this.apiBaseUrl + this.apiBasePath + '/api/v1/blocktime/git-hash',
      {}
    );
  }

}
