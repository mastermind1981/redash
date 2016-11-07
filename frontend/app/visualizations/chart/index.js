import { has, partial, intersection, without, contains, isUndefined, sortBy, each, pluck, keys, difference } from 'underscore';
import plotly from './plotly';
import template from './chart.html';
import editorTemplate from './chart-editor.html';

function ChartRenderer() {
  return {
    restrict: 'E',
    scope: {
      queryResult: '=',
      options: '=?',
    },
    template,
    replace: false,
    controller($scope) {
      $scope.chartSeries = [];

      function zIndexCompare(series) {
        if ($scope.options.seriesOptions[series.name]) {
          return $scope.options.seriesOptions[series.name].zIndex;
        }
        return 0;
      }

      function reloadData() {
        if (!isUndefined($scope.queryResult)) {
          const data = $scope.queryResult.getChartData($scope.options.columnMapping);
          $scope.chartSeries = sortBy(data, zIndexCompare);
        }
      }

      function reloadChart() {
        reloadData();
        $scope.plotlyOptions = $scope.options;
      }

      $scope.$watch('options', reloadChart, true);
      $scope.$watch('queryResult && queryResult.getData()', reloadData);
    },
  };
}

function ChartEditor(ColorPalette) {
  return {
    restrict: 'E',
    template: editorTemplate,
    scope: {
      queryResult: '=',
      options: '=?',
    },
    link(scope) {
      scope.currentTab = 'general';
      scope.colors = Object.assign({ Automatic: null }, ColorPalette);

      scope.stackingOptions = {
        Disabled: null,
        Enabled: 'normal',
        Percent: 'percent',
      };

      scope.chartTypes = {
        line: { name: 'Line', icon: 'line-chart' },
        column: { name: 'Bar', icon: 'bar-chart' },
        area: { name: 'Area', icon: 'area-chart' },
        pie: { name: 'Pie', icon: 'pie-chart' },
        scatter: { name: 'Scatter', icon: 'circle-o' },
      };

      scope.xAxisScales = ['datetime', 'linear', 'logarithmic', 'category'];
      scope.yAxisScales = ['linear', 'logarithmic', 'datetime'];

      scope.chartTypeChanged = () => {
        scope.options.seriesOptions.forEach((options) => {
          options.type = scope.options.globalSeriesType;
        });
      };

      function refreshColumns() {
        scope.columns = scope.queryResult.getColumns();
        scope.columnNames = pluck(scope.columns, 'name');
        if (scope.columnNames.length > 0) {
          each(difference(keys(scope.options.columnMapping), scope.columnNames), (column) => {
            delete scope.options.columnMapping[column];
          });
        }
      }

      function refreshColumnsAndForm() {
        refreshColumns();
        if (!scope.queryResult.getData() || scope.queryResult.getData().length === 0 || scope.columns.length === 0) {
          return;
        }
        scope.form.yAxisColumns = intersection(scope.form.yAxisColumns, scope.columnNames);
        if (!contains(scope.columnNames, scope.form.xAxisColumn)) {
          scope.form.xAxisColumn = undefined;
        }
        if (!contains(scope.columnNames, scope.form.groupby)) {
          scope.form.groupby = undefined;
        }
      }

      function refreshSeries() {
        const seriesNames = pluck(scope.queryResult.getChartData(scope.options.columnMapping), 'name');
        const existing = keys(scope.options.seriesOptions);
        each(difference(seriesNames, existing), (name) => {
          scope.options.seriesOptions[name] = {
            type: scope.options.globalSeriesType,
            yAxis: 0,
          };
          scope.form.seriesList.push(name);
        });
        each(difference(existing, seriesNames), (name) => {
          scope.form.seriesList = without(scope.form.seriesList, name);
          delete scope.options.seriesOptions[name];
        });
      }

      function setColumnRole(role, column) {
        scope.options.columnMapping[column] = role;
      }

      function unsetColumn(column) {
        setColumnRole('unused', column);
      }

      refreshColumns();

      scope.$watch('options.columnMapping', () => {
        if (scope.queryResult.status === 'done') {
          refreshSeries();
        }
      }, true);

      scope.$watch(() => [scope.queryResult.getId(), scope.queryResult.status], (changed) => {
        if (!changed[0] || changed[1] !== 'done') {
          return;
        }

        refreshColumnsAndForm();
        refreshSeries();
      }, true);

      scope.form = {
        yAxisColumns: [],
        seriesList: sortBy(keys(scope.options.seriesOptions), name =>
           scope.options.seriesOptions[name].zIndex
        ),
      };

      scope.$watchCollection('form.seriesList', (value) => {
        each(value, (name, index) => {
          scope.options.seriesOptions[name].zIndex = index;
          scope.options.seriesOptions[name].index = 0; // is this needed?
        });
      });


      scope.$watchCollection('form.yAxisColumns', (value, old) => {
        each(old, unsetColumn);
        each(value, partial(setColumnRole, 'y'));
      });

      scope.$watch('form.xAxisColumn', (value, old) => {
        if (old !== undefined) {
          unsetColumn(old);
        }
        if (value !== undefined) { setColumnRole('x', value); }
      });

      scope.$watch('form.groupby', (value, old) => {
        if (old !== undefined) {
          unsetColumn(old);
        }
        if (value !== undefined) {
          setColumnRole('series', value);
        }
      });

      if (!has(scope.options, 'legend')) {
        scope.options.legend = { enabled: true };
      }

      if (!has(scope.options, 'bottomMargin')) {
        scope.options.bottomMargin = 50;
      }

      if (scope.columnNames) {
        each(scope.options.columnMapping, (value, key) => {
          if (scope.columnNames.length > 0 && !contains(scope.columnNames, key)) {
            return;
          }
          if (value === 'x') {
            scope.form.xAxisColumn = key;
          } else if (value === 'y') {
            scope.form.yAxisColumns.push(key);
          } else if (value === 'series') {
            scope.form.groupby = key;
          }
        }); }
    },
  };
}


export default function (ngModule) {
  ngModule.directive('chartRenderer', ChartRenderer);
  ngModule.directive('chartEditor', ChartEditor);
  ngModule.config((VisualizationProvider) => {
    const renderTemplate = '<chart-renderer options="visualization.options" query-result="queryResult"></chart-renderer>';
    const editTemplate = '<chart-editor options="visualization.options" query-result="queryResult"></chart-editor>';

    const defaultOptions = {
      globalSeriesType: 'column',
      sortX: true,
      legend: { enabled: true },
      yAxis: [{ type: 'linear' }, { type: 'linear', opposite: true }],
      xAxis: { type: 'datetime', labels: { enabled: true } },
      series: { stacking: null },
      seriesOptions: {},
      columnMapping: {},
      bottomMargin: 50,
    };

    VisualizationProvider.registerVisualization({
      type: 'CHART',
      name: 'Chart',
      renderTemplate,
      editorTemplate: editTemplate,
      defaultOptions,
    });
  });
  plotly(ngModule);
}