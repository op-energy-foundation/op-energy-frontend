import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {
  BlockSpanTimeStrike,
  BlockSpanTimeStrikeGuess,
  BlockSpanTimeStrikeGuessesSummary,
  BlockTimeStrikeGuessPublic,
  PaginationResponse,
} from '../interfaces/oe-energy.interface';
import { APP_CONFIGURATION } from '../types/constant';

@Injectable({
  providedIn: 'root',
})
export class BlockrateTimeStrikeService {
  private apiBaseUrl: string;
  private apiBasePath: string;
  private defaultSpanSize = APP_CONFIGURATION.SPAN_SIZE;

  constructor(private httpClient: HttpClient) {
    this.apiBaseUrl =
      document.location.protocol + '//' + document.location.host;
    this.apiBasePath = '';
  }

  private resolveSpanSize(spanSize?: number): number {
    return spanSize ?? this.defaultSpanSize;
  }

  private get strikesBaseUrl(): string {
    return `${this.apiBaseUrl}${this.apiBasePath}/api/v2/strikes/blockrate`;
  }

  $strikesWithFilter(
    filter: any | {},
    pageNo = 0,
    spanSize?: number
  ): Observable<PaginationResponse<BlockSpanTimeStrike>> {
    const resolvedSpanSize = this.resolveSpanSize(spanSize);
    const url = `${this.strikesBaseUrl}/strikes?page=${pageNo}&filter=${encodeURI(JSON.stringify(filter))}&spanSize=${resolvedSpanSize}`;
    return this.httpClient.get<PaginationResponse<BlockSpanTimeStrike>>(url, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  $guessableStrikesWithFilter(
    pageNo: number,
    filter: any | {},
    spanSize?: number
  ): Observable<PaginationResponse<BlockSpanTimeStrike>> {
    return this.$strikesWithFilter({ ...filter, class: 'guessable' }, pageNo, spanSize);
  }

  $outcomeKnownStrikesWithFilter(
    pageNo: number,
    filter: any | {},
    spanSize?: number
  ): Observable<PaginationResponse<BlockSpanTimeStrike>> {
    return this.$strikesWithFilter({ ...filter, class: 'outcomeKnown' }, pageNo, spanSize);
  }

  $strike(
    blockHeight: number,
    strikeMediantime: number,
    spanSize?: number
  ): Observable<BlockSpanTimeStrike> {
    const resolvedSpanSize = this.resolveSpanSize(spanSize);
    const url = `${this.strikesBaseUrl}/strike/${blockHeight}/${strikeMediantime}?spanSize=${resolvedSpanSize}`;
    return this.httpClient.get<BlockSpanTimeStrike>(url, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  $strikeGuess(
    blockHeight: number,
    strikeMediantime: number,
    guess: 'slow' | 'fast',
    spanSize?: number
  ): Observable<BlockTimeStrikeGuessPublic> {
    const resolvedSpanSize = this.resolveSpanSize(spanSize);
    const url = `${this.strikesBaseUrl}/strike/${blockHeight}/${strikeMediantime}/guess/${guess}?spanSize=${resolvedSpanSize}`;
    return this.httpClient.post<BlockTimeStrikeGuessPublic>(url, null, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  $strikeGuessPerson(
    blockHeight: number,
    strikeMediantime: number,
    spanSize?: number
  ): Observable<BlockTimeStrikeGuessPublic> {
    const resolvedSpanSize = this.resolveSpanSize(spanSize);
    const url = `${this.strikesBaseUrl}/strike/${blockHeight}/${strikeMediantime}/guess?spanSize=${resolvedSpanSize}`;
    return this.httpClient.get<BlockTimeStrikeGuessPublic>(url, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  $getStrikeGuessesSummary(
    blockHeight: number,
    strikeMediantime: number,
    spanSize?: number
  ): Observable<BlockSpanTimeStrikeGuessesSummary> {
    const resolvedSpanSize = this.resolveSpanSize(spanSize);
    const url = `${this.strikesBaseUrl}/strike/${blockHeight}/${strikeMediantime}/guesses/summary?spanSize=${resolvedSpanSize}`;
    return this.httpClient.get<BlockSpanTimeStrikeGuessesSummary>(url, {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  $strikesGuessesWithFilter(
    filter: any | {},
    pageNo = 0
  ): Observable<PaginationResponse<BlockSpanTimeStrikeGuess>> {
    const url = `${this.strikesBaseUrl}/strikes/guesses?page=${pageNo}&filter=${encodeURIComponent(
      JSON.stringify(filter)
    )}`;
    return this.httpClient.get<PaginationResponse<BlockSpanTimeStrikeGuess>>(url, {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
