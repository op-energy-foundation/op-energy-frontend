import { TABLE_HEADERS } from './strikes-range.interface';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { BlockrateTimeStrikeService } from '../../services/blockratetimestrike.service';
import {
  Block,
  BlockSpanTimeStrike,
  PaginationResponse,
  StrikesFilter,
  TableColumn,
} from '../../interfaces/oe-energy.interface';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { catchError, of, Subscription, take } from 'rxjs';
import { OeStateService } from '../../services/state.service';
import { APP_CONFIGURATION, FormatType } from '../../types/constant';
import { getEmptyBlockHeader } from '../../utils/helper';

@Component({
  selector: 'app-strikes-range',
  templateUrl: './strikes-range.component.html',
  styleUrls: ['./strikes-range.component.scss'],
})
export class StrikesRangeComponent implements OnInit, OnDestroy {
  private blockSubscription: Subscription;
  private paramsSubscription: Subscription;
  reverseOrder: boolean = false;
  isLoading = true;
  headers: TableColumn[] = TABLE_HEADERS;
  currentPage: number = 1;
  totalPages: number = 1;
  tableData: BlockSpanTimeStrike[] = [];
  filter: any = {
    class: 'outcomeKnown',
  }; // This will be used for API calls
  urlFilter: StrikesFilter = {}; // This will be used for URL parameters
  guessableScreen = false;
  paramMappings = {
    startblock: 'strikeBlockHeightGTE',
    endblock: 'strikeBlockHeightLTE',
    startTime: 'strikeMediantimeGTE',
    endTime: 'strikeMediantimeLTE',
    sort: 'sort',
    page: 'page',
    outcome: 'class',
    result: 'observedResultEQ',
  };
  currentTip: number;
  linesPerPage = 15;
  format: FormatType = FormatType.TABLE;
  widgetData: {
    strike: BlockSpanTimeStrike;
    fromBlock?: Block;
    toBlock?: Block;
    fromBlockHeight?: number;
    toBlockHeight?: number;
    strikeTime?: number;
    existingGuess?: 'slow' | 'fast';
    preloaded: boolean;
  }[] = [];
  spanSize: number = APP_CONFIGURATION.SPAN_SIZE;
  FormatType = FormatType;

  constructor(
    private blockrateTimeStrikeService: BlockrateTimeStrikeService,
    private stateService: OeStateService,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.blockSubscription = this.stateService.latestReceivedBlock$
      .pipe(take(1)) // take only the latest block once
      .subscribe((block: Block) => {
        this.currentTip = block.height;

        this.paramsSubscription = this.route.queryParams.subscribe((params) => {
          this.setFilterFromParams(params);
          this.fetchOutcomeKnownStrikes(this.currentPage);
        });
      });
  }

  ngOnDestroy(): void {
    if (this.blockSubscription) {
      this.blockSubscription.unsubscribe();
    }
    if (this.paramsSubscription) {
      this.paramsSubscription.unsubscribe();
    }
  }

  setFilterFromParams(params: any): void {
    Object.keys(this.paramMappings).forEach((key) => {
      if (params[key]) {
        let value = +params[key] || params[key];
        if (key === 'outcome' && value === 'past') {
          value = 'outcomeKnown';
        }
        this.filter[this.paramMappings[key]] = value;
        this.urlFilter[key] = params[key];
        if (key === 'page') {
          this.currentPage = +params[key];
        }
        if (key === 'outcome') {
          this.guessableScreen = true;
        }
      }
    });
    if (params.hasOwnProperty('nextStrikes')) {
      delete this.filter.class;
      this.filter.strikeBlockHeightGTE = this.currentTip;
      this.filter.strikeBlockHeightLTE = this.currentTip + this.linesPerPage;
    }
    if (params.hasOwnProperty('lastStrikes')) {
      this.filter.strikeBlockHeightGTE = this.currentTip - this.linesPerPage;
      this.filter.strikeBlockHeightLTE = this.currentTip;
    }
    if (params['sort'] === 'descend_guesses_count') {
      delete this.filter.class;
    }
    if (params['format'] === FormatType.WIDGET) {
      this.format = FormatType.WIDGET;
    }
  }

  fetchOutcomeKnownStrikes(pageNumber: number): void {
    this.isLoading = true;
    this.currentPage = pageNumber;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.urlFilter, page: this.currentPage },
      queryParamsHandling: 'merge',
    });
    this.blockrateTimeStrikeService
      .$outcomeKnownStrikesWithFilter(pageNumber - 1, {
        ...this.filter,
        linesPerPage: this.linesPerPage,
      })
      .subscribe({
        next: (data) => this.handleData(data),
        error: (error) => this.handleError(error),
      });
  }

  private handleData(data: PaginationResponse<BlockSpanTimeStrike>): void {
    if (!data.results || !Array.isArray(data.results)) {
      this.tableData = [];
      this.isLoading = false;
      return;
    }
    if (data.results.length === 0) {
      this.toastr.warning(
        `Strikes not found please check provided filters`,
        'Warning!'
      );
      this.isLoading = false;
      return;
    }
    if (this.format === FormatType.WIDGET) {
      this.widgetData = data.results.map((result) => {
        if (result.mBlockSpan) {
          return {
            strike: result,
            fromBlock: result.mBlockSpan.startBlock as Block,
            toBlock: result.mBlockSpan.endBlock as Block,
            preloaded: true,
          };
        }
        const fromHeight = result.block - this.spanSize;
        const toHeight = result.block;
        return {
          strike: result,
          fromBlock: getEmptyBlockHeader(fromHeight) as Block,
          toBlock: getEmptyBlockHeader(toHeight) as Block,
          preloaded: true,
        };
      });
      this.isLoading = false;
      this.fetchBulkGuesses();
      return;
    } else {
      this.isLoading = false;
      this.tableData = data.results.map((result) => {
        const queryParams = {
          strikeHeight: result.block,
          strikeTime: result.mediantime,
          startblock: Math.min(this.currentTip, result.block - APP_CONFIGURATION.SPAN_SIZE),
        };
        return {
          ...result,
          queryParams,
          routerLink: '/hashstrikes/blockrate-strike-summary',
        };
      });
    }
  }

  private fetchBulkGuesses(): void {
    if (!this.widgetData.length) return;

    this.widgetData.forEach((item, index) => {
      this.blockrateTimeStrikeService
        .$strikeGuessPerson(item.strike.block, item.strike.mediantime)
        .pipe(catchError(() => of(null)))
        .subscribe((response) => {
          if (response?.guess) {
            this.widgetData[index] = { ...this.widgetData[index], existingGuess: response.guess };
          }
        });
    });
  }

  private handleError(error: any): void {
    this.toastr.error(`Strikes Failed To Fetch: ${error.error}`, 'Failed!');
    this.isLoading = false;
  }

  switchFormat(newFormat: FormatType): void {
    if (this.format === newFormat) return;
    this.format = newFormat;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { format: newFormat },
      queryParamsHandling: 'merge',
    });
  }

  onChildRowClick(item: BlockSpanTimeStrike): void {
    const queryParams = {
      strikeHeight: item.block,
      strikeTime: item.mediantime,
      startblock: Math.min(this.currentTip, item.block - APP_CONFIGURATION.SPAN_SIZE),
    };

    // all pages should goes to strike summary
    // Use the Router service to navigate with query parameters
    this.router.navigate(['/hashstrikes/blockrate-strike-summary'], {
      queryParams,
    });
  }
}
