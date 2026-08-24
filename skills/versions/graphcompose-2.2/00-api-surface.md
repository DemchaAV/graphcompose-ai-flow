---
skillId: graphcompose-api-surface
targetLibrary: GraphCompose
targetVersion: 2.2.x
verifiedAgainst: 2.2.0
status: active
lastValidated: 2026-08-24
generator: tools/api-surface/api-index.py
generatedFrom: "git tag v2.2.0 (io.github.demchaav:graph-compose:2.2.0)"
note: "Source-generated allow-list. Authoritative closed set: a symbol absent here does not exist for this version. Regenerate, do not hand-edit the body below."
---

# GraphCompose — Public API Surface (authoring)

> **Generated from source by `tools/api-index/api-index.py` — do not hand-edit.**
> This is the COMPLETE list of public methods/constants on the authoring surface.
> **If a method is not listed here, it does not exist — do not invent one.**
> Engine / layout / internal packages are excluded on purpose.
> Regenerate after API changes: `python .llm-wiki/tools/api-index/api-index.py`

**GraphCompose version:** 2.2.0

Types: 268 · methods: 1886 · constants: 317


## com.demcha.compose

### GraphCompose (class)
- `DocumentBuilder document()`
- `DocumentBuilder document(Path outputFile)`
- `MultiSectionDocumentBuilder documents()`
- `MultiSectionDocumentBuilder documents(Path outputFile)`
- `List<FontName> availableFonts()`
- `void renderAvailableFontsPreview(Path outputFile)`
- `byte[] renderAvailableFontsPreview()`
- `DocumentBuilder pageSize(DocumentPageSize pageSize)`
- `DocumentBuilder pageSize(double width, double height)`
- `DocumentBuilder margin(DocumentInsets margin)`
- `DocumentBuilder margin(float top, float right, float bottom, float left)`
- `DocumentBuilder markdown(boolean enabled)`
- `DocumentBuilder guideLines(boolean enabled)`
- `DocumentBuilder debug(DocumentDebugOptions options)`
- `DocumentBuilder pageBackground(com.demcha.compose.document.style.DocumentColor color)`
- `DocumentBuilder pageBackground(java.awt.Color color)`
- `DocumentBuilder pageBackgrounds(java.util.List<com.demcha.compose.document.api.PageBackgroundFill> fills)`
- `DocumentBuilder registerFontFamily(FontFamilyDefinition definition)`
- `DocumentBuilder registerFontFamily(FontName familyName, Path regular)`
- `DocumentBuilder registerFontFamily(String familyName, Path regular)`
- `DocumentBuilder registerFontFamily(FontName familyName, Path regular, Path bold, Path italic)`
- `DocumentBuilder registerFontFamily(String familyName, Path regular, Path bold, Path italic)`
- `DocumentBuilder registerFontFamily(FontName familyName, Path regular, Path bold, Path italic, Path boldItalic)`
- `DocumentBuilder registerFontFamily(String familyName, Path regular, Path bold, Path italic, Path boldItalic)`
- `DocumentSession create()`


## com.demcha.compose.document.api

### DocumentPageSize (record)
- `DocumentPageSize of(double width, double height)`
- `DocumentPageSize landscape()`
- `DocumentPageSize portrait()`
- constants: `A4`, `LETTER`, `LEGAL`, `SLIDE_16_9`, `SLIDE_4_3`

### DocumentSession (class)
- `new DocumentSession(Path defaultOutputFile, DocumentPageSize pageSize, DocumentInsets margin, Collection<FontFamilyDefinition> customFontFamilies, boolean markdown, boolean guideLines)`
- `DocumentDsl dsl()`
- `DocumentSession compose(Consumer<DocumentDsl> spec)`
- `PageFlowBuilder pageFlow()`
- `ContainerNode pageFlow(Consumer<PageFlowBuilder> spec)`
- `DocumentSession add(DocumentNode node)`
- `DocumentSession addAll(Collection<? extends DocumentNode> nodes)`
- `DocumentSession clear()`
- `DocumentSession pageSize(DocumentPageSize pageSize)`
- `DocumentSession pageSize(double width, double height)`
- `DocumentSession margin(DocumentInsets margin)`
- `DocumentSession markdown(boolean enabled)`
- `DocumentSession guideLines(boolean enabled)`
- `DocumentSession debug(DocumentDebugOptions options)`
- `DocumentSession pageBackground(DocumentColor color)`
- `DocumentSession pageBackground(Color color)`
- `DocumentSession pageBackgrounds(List<PageBackgroundFill> fills)`
- `DocumentSession pageMargins(List<PageMarginRule> rules)`
- `SessionChromeApi chrome()`
- `DocumentSession metadata(DocumentMetadata metadata)`
- `DocumentSession viewerPreferences(DocumentViewerPreferences viewerPreferences)`
- `DocumentSession watermark(DocumentWatermark watermark)`
- `DocumentSession protect(DocumentProtection protection)`
- `DocumentSession header(DocumentHeaderFooter header)`
- `DocumentSession footer(DocumentHeaderFooter footer)`
- `DocumentSession clearHeadersAndFooters()`
- `DocumentSession registerFontFamily(FontFamilyDefinition definition)`
- `<E extends DocumentNode> DocumentSession registerNodeDefinition(NodeDefinition<E> definition)`
- `SessionFontApi fonts()`
- `SessionLayoutApi layout()`
- `NodeRegistry registry()`
- `DocumentGraph documentGraph()`
- `LayoutCanvas canvas()`
- `double availableHeight()`
- `List<DocumentNode> roots()`
- `LayoutGraph layoutGraph()`
- `LayoutSnapshot layoutSnapshot()`
- `PageIndex pageIndex()`
- `<R> R render(FixedLayoutBackend<R> backend)`
- `<R> R render(FixedLayoutBackend<R> backend, Path outputFile)`
- `<R> R export(SemanticBackend<R> backend)`
- `<R> R export(SemanticBackend<R> backend, Path outputFile)`
- `byte[] toPdfBytes()`
- `void writePdf(OutputStream output)`
- `void buildPdf()`
- `void buildPdf(Path outputFile)`
- `byte[] toPptxBytes()`
- `void writePptx(OutputStream output)`
- `void buildPptx(Path outputFile)`
- `List<BufferedImage> toImages(int dpi)`
- `List<BufferedImage> toImages(int dpi, boolean transparent)`
- `BufferedImage toImage(int pageIndex, int dpi)`
- `BufferedImage toImage(int pageIndex, int dpi, boolean transparent)`
- `void close()`
- `boolean isClosed()`
- `<E extends DocumentNode> NodeRegistry register(NodeDefinition<E> definition)`
- `void ensureOpen()`
- `void ensureRenderable()`
- `String sessionId()`
- `long revision()`
- `int rootCount()`
- `List<FontFamilyDefinition> customFontFamilies()`
- `DocumentOutputOptions outputOptions()`
- `FixedLayoutRenderer convenienceBackend(String format)`
- `LayoutCompiler compiler()`
- `MeasurementResources measurementResources()`
- `boolean markdown()`
- `PageGeometry pageGeometry()`
- `boolean hasPageReference()`
- `Map<String, Integer> resolvePageNumbers(LayoutGraph graph)`

### MultiSectionDocument (class)
- `byte[] toPdfBytes()`
- `byte[] toPdfBytes(FixedLayoutRenderer backend)`
- `void writePdf(OutputStream output)`
- `void writePdf(FixedLayoutRenderer backend, OutputStream output)`
- `void buildPdf()`
- `void buildPdf(Path outputFile)`
- `List<LayoutSnapshot> sectionSnapshots()`
- `void close()`

### MultiSectionDocumentBuilder (class)
- `new MultiSectionDocumentBuilder()`
- `new MultiSectionDocumentBuilder(Path outputFile)`
- `MultiSectionDocumentBuilder section(DocumentSession section)`
- `MultiSectionDocument create()`

### PageBackgroundFill (record)
- `PageBackgroundFill fullPage(DocumentColor color)`
- `PageBackgroundFill leftColumn(double widthRatio, DocumentColor color)`
- `PageBackgroundFill rightColumn(double widthRatio, DocumentColor color)`
- `PageBackgroundFill column(double xRatio, double widthRatio, DocumentColor color)`
- `PageBackgroundFill topBand(double heightRatio, DocumentColor color)`
- `PageBackgroundFill bottomBand(double heightRatio, DocumentColor color)`
- `PageBackgroundFill band(double yRatioFromTop, double heightRatio, DocumentColor color)`
- `PageBackgroundFill topBandPoints(double heightPoints, double pageHeight, DocumentColor color)`
- `PageBackgroundFill bandPoints(double yFromTopPoints, double heightPoints, double pageHeight, DocumentColor color)`

### PageMarginRule (record)
- `PageMarginRule page(int page, DocumentInsets insets)`
- `PageMarginRule range(int fromPage, int toPage, DocumentInsets insets)`
- `PageMarginRule from(int fromPage, DocumentInsets insets)`
- `boolean coversPage(int pageNumber)`

### SessionChromeApi (class)
- `SessionChromeApi metadata(DocumentMetadata metadata)`
- `SessionChromeApi viewerPreferences(DocumentViewerPreferences viewerPreferences)`
- `SessionChromeApi watermark(DocumentWatermark watermark)`
- `SessionChromeApi protect(DocumentProtection protection)`
- `SessionChromeApi header(DocumentHeaderFooter header)`
- `SessionChromeApi footer(DocumentHeaderFooter footer)`
- `SessionChromeApi clearHeadersAndFooters()`
- `DocumentSession session()`

### SessionFontApi (class)
- `SessionFontApi registerFamily(FontFamilyDefinition definition)`
- `<E extends DocumentNode> SessionFontApi registerNodeDefinition(NodeDefinition<E> definition)`
- `DocumentSession session()`

### SessionLayoutApi (class)
- `LayoutGraph graph()`
- `DocumentGraph documentGraph()`
- `List<DocumentNode> roots()`
- `LayoutCanvas canvas()`
- `NodeRegistry registry()`
- `LayoutSnapshot snapshot()`
- `DocumentSession session()`


## com.demcha.compose.document.chart

### AxisSpec (record)
- `new AxisSpec(boolean baselineAtZero, Double min, Double max, NumberFormatSpec format, boolean showGridLines)`
- `AxisSpec defaults()`
- `Builder builder()`
- `Builder baselineAtZero(boolean v)`
- `Builder min(double v)`
- `Builder max(double v)`
- `Builder format(NumberFormatSpec f)`
- `Builder showGridLines(boolean v)`
- `Builder showTickLabels(boolean v)`
- `AxisSpec build()`

### BarGrouping (enum)
- constants: `GROUPED`, `STACKED`

### ChartData (record)
- `Builder builder()`
- `int seriesCount()`
- `int categoryCount()`
- `Series of(String name, double... values)`
- `Builder categories(String... labels)`
- `Builder category(String label)`
- `Builder series(Series s)`
- `Builder series(String name, double... values)`
- `ChartData build()`

### ChartDefaults (class)
- constants: `BAR_WIDTH_RATIO`, `TARGET_TICKS`, `DEFAULT_PALETTE`, `DEFAULT_GRID_STROKE`, `AXIS_TEXT_STYLE`, `LEGEND_TEXT_STYLE`, `VALUE_LABEL_TEXT_STYLE`, `VALUE_LABEL_HALO`, `SLICE_STROKE`, `DONUT_CENTER_TEXT_STYLE`, `SECTOR_TESSELLATION_STEP_DEGREES`, `DEFAULT_THEME`

### ChartLayoutResolver (class)
- `List<ChartPrimitive> resolve(ChartSpec spec, ChartStyle style, ChartTheme theme, double width, double height, ChartTextMetrics metrics)`

### ChartPrimitive (record)

### ChartSize (interface)
- `double resolveHeight(double availableWidth)`

### ChartSpec (interface)
- `Bar(ChartData data, boolean horizontal, BarGrouping grouping, AxisSpec valueAxis, LegendPosition legend, ValueLabelMode valueLabels, ChartSize size)`
- `NumberFormatSpec valueFormat()`
- `Builder data(ChartData d)`
- `Builder horizontal(boolean v)`
- `Builder showCategoryLabels(boolean v)`
- `Builder grouping(BarGrouping g)`
- `Builder valueAxis(AxisSpec a)`
- `Builder legend(LegendPosition l)`
- `Builder valueLabels(ValueLabelMode m)`
- `Builder size(ChartSize s)`
- `Bar build()`
- `Line(ChartData data, LineInterpolation interpolation, AxisSpec valueAxis, LegendPosition legend, ValueLabelMode valueLabels, ChartSize size)`
- `Builder interpolation(LineInterpolation mode)`
- `Builder area(boolean v)`
- `Line build()`
- `Builder donutRatio(double ratio)`
- `Builder startAngleDegrees(double degrees)`
- `Builder clockwise(boolean v)`
- `Builder sliceLabels(SliceLabelMode mode)`
- `Builder valueFormat(NumberFormatSpec f)`
- `Builder percentFormat(NumberFormatSpec f)`
- `Builder centerText(String text)`
- `Pie build()`

### ChartStyle (record)
- `ChartStyle inherit()`
- `Builder builder()`
- `ChartStyle mergedUnder(ChartStyle top)`
- `DocumentPaint paintForSeries(int index, List<DocumentPaint> fallbackPalette)`
- `GridStyle horizontal(DocumentStroke stroke)`
- `GridStyle none()`
- `Builder palette(DocumentPaint... paints)`
- `Builder seriesPaint(int index, DocumentPaint paint)`
- `Builder lineWidth(double width)`
- `Builder barCornerRadius(DocumentCornerRadius r)`
- `Builder barWidthRatio(double ratio)`
- `Builder grid(GridStyle grid)`
- `Builder pointMarker(PointMarker marker)`
- `Builder valueLabelOffset(double offset)`
- `Builder axisTextStyle(DocumentTextStyle s)`
- `Builder legendTextStyle(DocumentTextStyle s)`
- `Builder valueLabelTextStyle(DocumentTextStyle s)`
- `Builder valueLabelHalo(DocumentPaint halo)`
- `Builder areaOpacity(double opacity)`
- `Builder sliceStroke(DocumentStroke stroke)`
- `Builder sliceGapDegrees(double degrees)`
- `Builder donutCenterTextStyle(DocumentTextStyle s)`
- `ChartStyle build()`

### ChartTextMetrics (interface)

### ChartTheme (record)
- `ChartStyle toChartStyle()`

### LegendPosition (enum)
- constants: `NONE`, `BOTTOM`, `RIGHT`, `TOP`

### LineInterpolation (enum)
- constants: `LINEAR`, `SMOOTH`, `MONOTONE`

### NiceScale (record)
- `NiceScale compute(double dataMin, double dataMax, boolean includeZero, int targetTicks)`
- `double fractionOf(double value)`

### NumberFormatSpec (record)
- `NumberFormatSpec pattern(String pattern)`
- `NumberFormatSpec defaults()`
- `NumberFormatSpec withLocale(Locale locale)`
- `NumberFormatSpec withPrefix(String prefix)`
- `NumberFormatSpec withSuffix(String suffix)`
- `NumberFormatSpec scaledBy(double scaleDivisor)`
- `String format(double value)`
- `java.text.DecimalFormat formatter()`

### PointMarker (record)
- `PointMarker circle(double diameter)`
- `PointMarker ellipse(double width, double height)`
- `PointMarker withFill(DocumentPaint fill)`
- `PointMarker withStroke(DocumentStroke stroke)`

### SliceLabelMode (enum)
- constants: `NONE`, `VALUE`, `PERCENT`, `CATEGORY`, `CATEGORY_PERCENT`

### ValueLabelMode (enum)
- constants: `NONE`, `OUTSIDE`, `INSIDE`


## com.demcha.compose.document.dsl

### AbstractFlowBuilder (class)
- `T name(String name)`
- `T anchor(String anchor)`
- `T bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `T spacing(double spacing)`
- `T padding(DocumentInsets padding)`
- `T padding(float top, float right, float bottom, float left)`
- `T margin(DocumentInsets margin)`
- `T margin(float top, float right, float bottom, float left)`
- `T bleed(DocumentBleed bleed)`
- `T bleedToEdge(DocumentEdge... edges)`
- `T fillColor(Color fillColor)`
- `T fillColor(DocumentColor fillColor)`
- `T stroke(DocumentStroke stroke)`
- `T borders(DocumentBorders borders)`
- `T cornerRadius(double radius)`
- `T cornerRadius(DocumentCornerRadius cornerRadius)`
- `T band(DocumentColor color)`
- `T softPanel(DocumentColor color, double radius, double padding)`
- `T softPanel(DocumentColor color, DocumentCornerRadius cornerRadius, double padding)`
- `T softPanel(DocumentColor color)`
- `T softPanel(DocumentColor color, double radius, double padding, DocumentStroke stroke)`
- `T softPanel(DocumentColor color, DocumentCornerRadius cornerRadius, double padding, DocumentStroke stroke)`
- `T accentLeft(DocumentColor color, double width)`
- `T accentRight(DocumentColor color, double width)`
- `T accentTop(DocumentColor color, double width)`
- `T accentBottom(DocumentColor color, double width)`
- `T add(DocumentNode node)`
- `T addParagraph(Consumer<ParagraphBuilder> spec)`
- `T addParagraph(String text)`
- `T addParagraph(String text, DocumentTextStyle textStyle)`
- `T addText(Consumer<ParagraphBuilder> spec)`
- `T addText(String text)`
- `T addText(String text, DocumentTextStyle textStyle)`
- `T addList(Consumer<ListBuilder> spec)`
- `T addList(String... items)`
- `T addList(List<String> items)`
- `T addImage(Consumer<ImageBuilder> spec)`
- `T addImage(DocumentImageData data, double width, double height)`
- `T addShape(Consumer<ShapeBuilder> spec)`
- `T addShape(double width, double height, DocumentColor fillColor)`
- `T addSpacer(Consumer<SpacerBuilder> spec)`
- `T spacer(double width, double height)`
- `T addLine(Consumer<LineBuilder> spec)`
- `T addEllipse(Consumer<EllipseBuilder> spec)`
- `T addPath(Consumer<PathBuilder> spec)`
- `T addSvgIcon(com.demcha.compose.document.svg.SvgIcon icon, double width)`
- `T addSvgIcon(com.demcha.compose.document.svg.SvgIcon icon, double width, com.demcha.compose.document.node.HorizontalAlign align)`
- `T addAligned(com.demcha.compose.document.node.HorizontalAlign align, com.demcha.compose.document.node.DocumentNode node)`
- `T addEllipse(double diameter, DocumentColor fillColor)`
- `T addEllipse(double width, double height, DocumentColor fillColor)`
- `T addCircle(double diameter)`
- `T addCircle(double diameter, DocumentColor fillColor)`
- `T addCircle(double diameter, Consumer<EllipseBuilder> spec)`
- `T addContainer(Consumer<ShapeContainerBuilder> spec)`
- `T addCanvas(double width, double height, Consumer<CanvasLayerBuilder> spec)`
- `T addCircle(double diameter, DocumentColor fillColor, Consumer<ShapeContainerBuilder> spec)`
- `T addEllipse(double width, double height, DocumentColor fillColor, Consumer<ShapeContainerBuilder> spec)`
- `T addBarcode(Consumer<BarcodeBuilder> spec)`
- `T chart(ChartSpec spec)`
- `T chart(ChartSpec spec, ChartStyle style)`
- `T addDivider(Consumer<DividerBuilder> spec)`
- `T addTable(Consumer<TableBuilder> spec)`
- `T addLayerStack(Consumer<LayerStackBuilder> spec)`
- `T addRich(RichText rich)`
- `T addRich(Consumer<RichText> spec)`
- `T addLink(String text, String uri)`
- `T addLink(String text, DocumentLinkOptions options)`
- `T addRow(Consumer<RowBuilder> spec)`
- `T addRow(String name, Consumer<RowBuilder> spec)`
- `T addSection(Consumer<SectionBuilder> spec)`
- `T addSection(String name, Consumer<SectionBuilder> spec)`
- `T addTableOfContents(Consumer<TocBuilder> spec)`
- `T addPageReference(String anchor)`
- `T addPageReference(String anchor, DocumentTextStyle textStyle, TextAlign align)`
- `T headingBar(String text)`
- `T headingBar(String text, Consumer<HeadingBarStyle> customizer)`
- `T addTimeline(Consumer<TimelineBuilder> spec)`
- `T module(String title, Consumer<ModuleBuilder> spec)`
- `T module(Consumer<ModuleBuilder> spec)`
- `T addModule(String title, Consumer<ModuleBuilder> spec)`
- `T addModule(Consumer<ModuleBuilder> spec)`
- `T addPageBreak(Consumer<PageBreakBuilder> spec)`

### BarcodeBuilder (class)
- `new BarcodeBuilder()`
- `BarcodeBuilder name(String name)`
- `BarcodeBuilder options(DocumentBarcodeOptions options)`
- `BarcodeBuilder data(String content)`
- `BarcodeBuilder type(DocumentBarcodeType type)`
- `BarcodeBuilder qrCode()`
- `BarcodeBuilder code128()`
- `BarcodeBuilder code39()`
- `BarcodeBuilder ean13()`
- `BarcodeBuilder ean8()`
- `BarcodeBuilder foreground(Color foreground)`
- `BarcodeBuilder foreground(DocumentColor foreground)`
- `BarcodeBuilder background(Color background)`
- `BarcodeBuilder background(DocumentColor background)`
- `BarcodeBuilder quietZone(int quietZoneMargin)`
- `BarcodeBuilder width(double width)`
- `BarcodeBuilder height(double height)`
- `BarcodeBuilder size(double width, double height)`
- `BarcodeBuilder link(DocumentLinkOptions linkOptions)`
- `BarcodeBuilder linkTarget(DocumentLinkTarget linkTarget)`
- `BarcodeBuilder linkTo(String anchor)`
- `BarcodeBuilder anchor(String anchor)`
- `BarcodeBuilder bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `BarcodeBuilder padding(DocumentInsets padding)`
- `BarcodeBuilder margin(DocumentInsets margin)`
- `BarcodeBuilder transform(DocumentTransform transform)`
- `DocumentTransform currentTransform()`
- `BarcodeNode build()`

### CanvasLayerBuilder (class)
- `new CanvasLayerBuilder(double width, double height)`
- `CanvasLayerBuilder name(String name)`
- `CanvasLayerBuilder size(double width, double height)`
- `CanvasLayerBuilder position(DocumentNode child, double x, double y)`
- `CanvasLayerBuilder clipPolicy(ClipPolicy clipPolicy)`
- `CanvasLayerBuilder padding(DocumentInsets padding)`
- `CanvasLayerBuilder margin(DocumentInsets margin)`
- `CanvasLayerNode build()`

### DividerBuilder (class)
- `DividerBuilder width(double width)`
- `DividerBuilder height(double height)`
- `DividerBuilder thickness(double height)`
- `DividerBuilder color(Color color)`
- `DividerBuilder color(DocumentColor color)`
- `DividerBuilder name(String name)`
- `DividerBuilder padding(DocumentInsets padding)`
- `DividerBuilder margin(DocumentInsets margin)`
- `ShapeNode build()`

### DocumentDsl (class)
- `new DocumentDsl(DocumentSession session)`
- `PageFlowBuilder pageFlow()`
- `ContainerNode pageFlow(Consumer<PageFlowBuilder> spec)`
- `SectionBuilder section()`
- `ModuleBuilder module()`
- `ParagraphBuilder paragraph()`
- `ListBuilder list()`
- `ImageBuilder image()`
- `ShapeBuilder shape()`
- `BarcodeBuilder barcode()`
- `DividerBuilder divider()`
- `TableBuilder table()`
- `PageBreakBuilder pageBreak()`
- `RichText richText(Consumer<RichText> spec)`

### EllipseBuilder (class)
- `new EllipseBuilder()`
- `EllipseBuilder name(String name)`
- `EllipseBuilder width(double width)`
- `EllipseBuilder height(double height)`
- `EllipseBuilder size(double width, double height)`
- `EllipseBuilder circle(double diameter)`
- `EllipseBuilder fillColor(Color fillColor)`
- `EllipseBuilder fillColor(DocumentColor fillColor)`
- `EllipseBuilder stroke(DocumentStroke stroke)`
- `EllipseBuilder link(DocumentLinkOptions linkOptions)`
- `EllipseBuilder linkTarget(DocumentLinkTarget linkTarget)`
- `EllipseBuilder linkTo(String anchor)`
- `EllipseBuilder anchor(String anchor)`
- `EllipseBuilder bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `EllipseBuilder padding(DocumentInsets padding)`
- `EllipseBuilder margin(DocumentInsets margin)`
- `EllipseBuilder transform(DocumentTransform transform)`
- `DocumentTransform currentTransform()`
- `EllipseNode build()`

### HeadingBarStyle (class)
- `new HeadingBarStyle()`
- `HeadingBarStyle fill(DocumentColor fill)`
- `HeadingBarStyle cornerRadius(double radius)`
- `HeadingBarStyle cornerRadius(DocumentCornerRadius cornerRadius)`
- `HeadingBarStyle padding(double padding)`
- `HeadingBarStyle padding(DocumentInsets padding)`
- `HeadingBarStyle margin(DocumentInsets margin)`
- `HeadingBarStyle textStyle(DocumentTextStyle textStyle)`
- `HeadingBarStyle align(TextAlign align)`
- `HeadingBarStyle stroke(DocumentStroke stroke)`

### ImageBuilder (class)
- `new ImageBuilder()`
- `ImageBuilder name(String name)`
- `ImageBuilder source(DocumentImageData imageData)`
- `ImageBuilder source(byte[] bytes)`
- `ImageBuilder source(Path path)`
- `ImageBuilder source(String path)`
- `ImageBuilder width(double width)`
- `ImageBuilder height(double height)`
- `ImageBuilder size(double width, double height)`
- `ImageBuilder scale(double scale)`
- `ImageBuilder fitToBounds(double width, double height)`
- `ImageBuilder fitMode(DocumentImageFitMode fitMode)`
- `ImageBuilder link(DocumentLinkOptions linkOptions)`
- `ImageBuilder linkTarget(DocumentLinkTarget linkTarget)`
- `ImageBuilder linkTo(String anchor)`
- `ImageBuilder anchor(String anchor)`
- `ImageBuilder bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `ImageBuilder padding(DocumentInsets padding)`
- `ImageBuilder margin(DocumentInsets margin)`
- `ImageBuilder transform(DocumentTransform transform)`
- `DocumentTransform currentTransform()`
- `ImageNode build()`

### LayerStackBuilder (class)
- `new LayerStackBuilder()`
- `LayerStackBuilder name(String name)`
- `LayerStackBuilder layer(DocumentNode node)`
- `LayerStackBuilder layer(DocumentNode node, LayerAlign align)`
- `LayerStackBuilder layer(DocumentNode node, LayerAlign align, int zIndex)`
- `LayerStackBuilder position(DocumentNode node, double offsetX, double offsetY, LayerAlign align)`
- `LayerStackBuilder position(DocumentNode node, double offsetX, double offsetY, LayerAlign align, int zIndex)`
- `LayerStackBuilder back(DocumentNode node)`
- `LayerStackBuilder topLeft(DocumentNode node)`
- `LayerStackBuilder topCenter(DocumentNode node)`
- `LayerStackBuilder topRight(DocumentNode node)`
- `LayerStackBuilder centerLeft(DocumentNode node)`
- `LayerStackBuilder center(DocumentNode node)`
- `LayerStackBuilder centerRight(DocumentNode node)`
- `LayerStackBuilder bottomLeft(DocumentNode node)`
- `LayerStackBuilder bottomCenter(DocumentNode node)`
- `LayerStackBuilder bottomRight(DocumentNode node)`
- `LayerStackBuilder padding(DocumentInsets padding)`
- `LayerStackBuilder padding(double padding)`
- `LayerStackBuilder margin(DocumentInsets margin)`
- `LayerStackBuilder margin(double margin)`
- `LayerStackBuilder clipToBounds()`
- `LayerStackBuilder clipToBounds(boolean clip)`
- `LayerStackNode build()`

### LineBuilder (class)
- `new LineBuilder()`
- `LineBuilder name(String name)`
- `LineBuilder width(double width)`
- `LineBuilder height(double height)`
- `LineBuilder size(double width, double height)`
- `LineBuilder horizontal(double width)`
- `LineBuilder vertical(double height)`
- `LineBuilder diagonal(double width, double height)`
- `LineBuilder from(double x, double y)`
- `LineBuilder to(double x, double y)`
- `LineBuilder stroke(DocumentStroke stroke)`
- `LineBuilder color(DocumentColor color)`
- `LineBuilder thickness(double thickness)`
- `LineBuilder dashed(double... pattern)`
- `LineBuilder dashed(DocumentDashPattern pattern)`
- `LineBuilder dashed()`
- `LineBuilder lineCap(DocumentLineCap lineCap)`
- `LineBuilder fill()`
- `LineBuilder keepWithNext()`
- `LineBuilder keepWithNext(boolean value)`
- `LineBuilder link(DocumentLinkOptions linkOptions)`
- `LineBuilder linkTarget(DocumentLinkTarget linkTarget)`
- `LineBuilder linkTo(String anchor)`
- `LineBuilder anchor(String anchor)`
- `LineBuilder bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `LineBuilder padding(DocumentInsets padding)`
- `LineBuilder margin(DocumentInsets margin)`
- `LineBuilder transform(DocumentTransform transform)`
- `DocumentTransform currentTransform()`
- `LineNode build()`

### ListBuilder (class)
- `new ListBuilder()`
- `ListBuilder name(String name)`
- `ListBuilder items(String... items)`
- `ListBuilder items(List<String> items)`
- `ListBuilder addItem(String item)`
- `ListBuilder addItem(String label, Consumer<ListBuilder> body)`
- `ListBuilder markerFor(int depth, ListMarker marker)`
- `ListBuilder marker(ListMarker marker)`
- `ListBuilder marker(String marker)`
- `ListBuilder bullet()`
- `ListBuilder dash()`
- `ListBuilder noMarker()`
- `ListBuilder textStyle(DocumentTextStyle textStyle)`
- `ListBuilder align(TextAlign align)`
- `ListBuilder lineSpacing(double lineSpacing)`
- `ListBuilder itemSpacing(double itemSpacing)`
- `ListBuilder continuationIndent(String continuationIndent)`
- `ListBuilder normalizeMarkers(boolean normalizeMarkers)`
- `ListBuilder padding(DocumentInsets padding)`
- `ListBuilder padding(float top, float right, float bottom, float left)`
- `ListBuilder margin(DocumentInsets margin)`
- `ListBuilder margin(float top, float right, float bottom, float left)`
- `ListNode build()`
- `Map<Integer, ListMarker> markerOverrides()`

### ModuleBuilder (class)
- `new ModuleBuilder()`
- `ModuleBuilder title(String title)`
- `ModuleBuilder titleStyle(DocumentTextStyle titleStyle)`
- `ModuleBuilder titleAlign(TextAlign titleAlign)`
- `ModuleBuilder titleLineSpacing(double titleLineSpacing)`
- `ModuleBuilder titlePadding(DocumentInsets titlePadding)`
- `ModuleBuilder titleMargin(DocumentInsets titleMargin)`
- `ModuleBuilder paragraph(String text)`
- `ModuleBuilder paragraph(Consumer<ParagraphBuilder> spec)`
- `ModuleBuilder bullets(List<String> items)`
- `ModuleBuilder bullets(String... items)`
- `ModuleBuilder dashList(List<String> items)`
- `ModuleBuilder dashList(String... items)`
- `ModuleBuilder rows(List<String> rows)`
- `ModuleBuilder rows(String... rows)`
- `ModuleBuilder list(List<String> items, Consumer<ListBuilder> spec)`
- `ModuleBuilder table(TableNode table)`
- `ModuleBuilder table(Consumer<TableBuilder> spec)`
- `ModuleBuilder table(List<String> headers, List<List<String>> rows)`
- `ModuleBuilder image(ImageNode image)`
- `ModuleBuilder image(Consumer<ImageBuilder> spec)`
- `ModuleBuilder divider(Consumer<DividerBuilder> spec)`
- `ModuleBuilder pageBreak(String name)`
- `ModuleBuilder custom(DocumentNode node)`
- `ModuleBuilder keepTogether()`
- `ModuleBuilder keepTogether(boolean value)`
- `SectionNode build()`

### PageBreakBuilder (class)
- `new PageBreakBuilder()`
- `PageBreakBuilder name(String name)`
- `PageBreakBuilder margin(DocumentInsets margin)`
- `PageBreakNode build()`

### PageFlowBuilder (class)
- `ContainerNode build()`

### ParagraphBuilder (class)
- `new ParagraphBuilder()`
- `ParagraphBuilder name(String name)`
- `ParagraphBuilder text(String text)`
- `ParagraphBuilder textStyle(DocumentTextStyle textStyle)`
- `ParagraphBuilder align(TextAlign align)`
- `ParagraphBuilder direction(TextDirection direction)`
- `ParagraphBuilder verticalAlign(TextVerticalAlign verticalAlign)`
- `ParagraphBuilder lineSpacing(double lineSpacing)`
- `ParagraphBuilder bulletOffset(String bulletOffset)`
- `ParagraphBuilder indentStrategy(DocumentTextIndent indentStrategy)`
- `ParagraphBuilder link(DocumentLinkOptions linkOptions)`
- `ParagraphBuilder linkTarget(DocumentLinkTarget linkTarget)`
- `ParagraphBuilder linkTo(String anchor)`
- `ParagraphBuilder anchor(String anchor)`
- `ParagraphBuilder inlineText(String text)`
- `ParagraphBuilder inlineText(String text, DocumentTextStyle textStyle)`
- `ParagraphBuilder inlineLink(String text, DocumentLinkOptions linkOptions)`
- `ParagraphBuilder inlineLinkTo(String text, String anchor)`
- `ParagraphBuilder inlineText(String text, DocumentTextStyle textStyle, DocumentLinkOptions linkOptions)`
- `ParagraphBuilder inlineHighlight(String text, DocumentTextStyle textStyle, DocumentColor background, double cornerRadius, DocumentInsets padding)`
- `ParagraphBuilder inlineHighlight(String text, DocumentTextStyle textStyle, DocumentColor background, double cornerRadius, DocumentInsets padding, DocumentLinkOptions link)`
- `ParagraphBuilder inlineCode(String text)`
- `ParagraphBuilder inlineCode(String text, DocumentTextStyle textStyle)`
- `ParagraphBuilder inlineChip(String text, DocumentColor fg, DocumentColor bg)`
- `ParagraphBuilder inlineImage(DocumentImageData imageData, double width, double height)`
- `ParagraphBuilder inlineImage(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment)`
- `ParagraphBuilder inlineImage(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `ParagraphBuilder inlineImageLinkTo(DocumentImageData imageData, double width, double height, String anchor)`
- `ParagraphBuilder inlineImageLinkTo(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment, double baselineOffset, String anchor)`
- `ParagraphBuilder dot(double diameter, DocumentColor fill)`
- `ParagraphBuilder dot(double diameter, DocumentColor fill, DocumentStroke stroke)`
- `ParagraphBuilder ellipse(double width, double height, DocumentColor fill, DocumentStroke stroke)`
- `ParagraphBuilder diamond(double size, DocumentColor fill)`
- `ParagraphBuilder triangle(double size, DocumentColor fill)`
- `ParagraphBuilder star(double size, DocumentColor fill)`
- `ParagraphBuilder arrow(double size, ShapeOutline.Direction direction, DocumentColor fill)`
- `ParagraphBuilder arrow(double size, ShapeOutline.Direction direction, ShapeOutline.ArrowStyle style, DocumentColor fill)`
- `ParagraphBuilder chevron(double size, ShapeOutline.Direction direction, DocumentColor fill)`
- `ParagraphBuilder shape(ShapeOutline outline, DocumentColor fill)`
- `ParagraphBuilder shape(ShapeOutline outline, DocumentColor fill, DocumentStroke stroke, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `ParagraphBuilder inlineSvgIcon(SvgIcon icon, double size)`
- `ParagraphBuilder inlineSvgIcon(SvgIcon icon, double size, InlineImageAlignment alignment)`
- `ParagraphBuilder inlineSvgIcon(SvgIcon icon, double size, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `ParagraphBuilder inlineEmoji(String shortcode, double size)`
- `ParagraphBuilder inlineEmoji(String shortcode, double size, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `ParagraphBuilder shapeLinkTo(ShapeOutline outline, DocumentColor fill, String anchor)`
- `ParagraphBuilder shapeLinkTo(ShapeOutline outline, DocumentColor fill, DocumentStroke stroke, InlineImageAlignment alignment, double baselineOffset, String anchor)`
- `ParagraphBuilder checkbox(double size, boolean checked, DocumentColor boxColor, DocumentColor checkColor)`
- `ParagraphBuilder checkbox(double size, boolean checked, DocumentColor color)`
- `ParagraphBuilder checkbox(double size, boolean checked, ShapeOutline.CheckmarkStyle markStyle, DocumentColor boxColor, DocumentColor checkColor)`
- `ParagraphBuilder checkbox(double size, boolean checked, ShapeOutline mark, DocumentColor boxColor, DocumentColor checkColor)`
- `ParagraphBuilder rich(RichText rich)`
- `ParagraphBuilder rich(Consumer<RichText> spec)`
- `ParagraphBuilder inlineRuns(List<InlineTextRun> inlineTextRuns)`
- `ParagraphBuilder inlineRunsMixed(List<? extends InlineRun> runs)`
- `ParagraphBuilder bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `ParagraphBuilder padding(DocumentInsets padding)`
- `ParagraphBuilder padding(float top, float right, float bottom, float left)`
- `ParagraphBuilder margin(DocumentInsets margin)`
- `ParagraphBuilder margin(float top, float right, float bottom, float left)`
- `ParagraphBuilder autoSize(DocumentTextAutoSize autoSize)`
- `ParagraphBuilder autoSize(double maxSize, double minSize)`
- `ParagraphBuilder autoSize(double maxSize)`
- `ParagraphNode build()`

### PathBuilder (class)
- `new PathBuilder()`
- `PathBuilder name(String name)`
- `PathBuilder width(double width)`
- `PathBuilder height(double height)`
- `PathBuilder size(double width, double height)`
- `PathBuilder moveTo(double x, double y)`
- `PathBuilder lineTo(double x, double y)`
- `PathBuilder curveTo(double control1X, double control1Y, double control2X, double control2Y, double x, double y)`
- `PathBuilder closePath()`
- `PathBuilder svg(SvgPath svgPath)`
- `PathBuilder fillColor(DocumentColor fillColor)`
- `PathBuilder fillColor(Color fillColor)`
- `PathBuilder fill(DocumentPaint fillPaint)`
- `PathBuilder stroke(DocumentStroke stroke)`
- `PathBuilder strokePaint(DocumentPaint strokePaint)`
- `PathBuilder dashed(double... pattern)`
- `PathBuilder dashed(DocumentDashPattern pattern)`
- `PathBuilder lineCap(DocumentLineCap lineCap)`
- `PathBuilder lineJoin(DocumentLineJoin lineJoin)`
- `PathBuilder padding(DocumentInsets padding)`
- `PathBuilder margin(DocumentInsets margin)`
- `PathNode build()`

### RichText (class)
- `RichText empty()`
- `RichText text(String text)`
- `RichText plain(String text)`
- `RichText bold(String text)`
- `RichText italic(String text)`
- `RichText boldItalic(String text)`
- `RichText underline(String text)`
- `RichText strikethrough(String text)`
- `RichText color(String text, DocumentColor color)`
- `RichText color(String text, Color color)`
- `RichText accent(String text, DocumentColor color)`
- `RichText accent(String text, Color color)`
- `RichText size(String text, double size)`
- `RichText style(String text, DocumentTextStyle style)`
- `RichText highlight(String text, DocumentTextStyle textStyle, DocumentColor background, double cornerRadius, DocumentInsets padding)`
- `RichText highlight(String text, DocumentTextStyle textStyle, DocumentColor background, double cornerRadius, DocumentInsets padding, DocumentLinkOptions link)`
- `RichText code(String text)`
- `RichText code(String text, DocumentTextStyle textStyle)`
- `RichText chip(String text, DocumentColor fg, DocumentColor bg)`
- `RichText link(String text, DocumentLinkOptions options)`
- `RichText link(String text, String uri)`
- `RichText linkTo(String text, String anchor)`
- `RichText linkTo(String text, DocumentTextStyle style, String anchor)`
- `RichText with(String text, DocumentTextStyle style, DocumentLinkOptions link)`
- `RichText space()`
- `RichText append(RichText other)`
- `RichText image(DocumentImageData imageData, double width, double height)`
- `RichText image(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment)`
- `RichText image(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `RichText imageLinkTo(DocumentImageData imageData, double width, double height, String anchor)`
- `RichText imageLinkTo(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment, double baselineOffset, String anchor)`
- `RichText svgIcon(SvgIcon icon, double size)`
- `RichText svgIcon(SvgIcon icon, double size, InlineImageAlignment alignment)`
- `RichText svgIcon(SvgIcon icon, double size, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `RichText emoji(String shortcode, double size)`
- `RichText emoji(String shortcode, double size, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `RichText dot(double diameter, DocumentColor fill)`
- `RichText dot(double diameter, DocumentColor fill, DocumentStroke stroke)`
- `RichText ellipse(double width, double height, DocumentColor fill, DocumentStroke stroke)`
- `RichText diamond(double size, DocumentColor fill)`
- `RichText triangle(double size, DocumentColor fill)`
- `RichText star(double size, DocumentColor fill)`
- `RichText arrow(double size, ShapeOutline.Direction direction, DocumentColor fill)`
- `RichText arrow(double size, ShapeOutline.Direction direction, ShapeOutline.ArrowStyle style, DocumentColor fill)`
- `RichText chevron(double size, ShapeOutline.Direction direction, DocumentColor fill)`
- `RichText shape(ShapeOutline outline, DocumentColor fill)`
- `RichText shape(ShapeOutline outline, DocumentColor fill, DocumentStroke stroke, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `RichText shapeLinkTo(ShapeOutline outline, DocumentColor fill, String anchor)`
- `RichText shapeLinkTo(ShapeOutline outline, DocumentColor fill, DocumentStroke stroke, InlineImageAlignment alignment, double baselineOffset, String anchor)`
- `RichText sparkline(double width, double height, DocumentColor fill, double... values)`
- `RichText sparklineLine(double width, double height, double thickness, DocumentColor color, double... values)`
- `RichText checkbox(double size, boolean checked, DocumentColor boxColor, DocumentColor checkColor)`
- `RichText checkbox(double size, boolean checked, DocumentColor color)`
- `RichText checkbox(double size, boolean checked, ShapeOutline.CheckmarkStyle markStyle, DocumentColor boxColor, DocumentColor checkColor)`
- `RichText checkbox(double size, boolean checked, ShapeOutline mark, DocumentColor boxColor, DocumentColor checkColor)`
- `List<InlineRun> runs()`
- `int size()`
- `boolean isEmpty()`

### RowBuilder (class)
- `new RowBuilder()`
- `RowBuilder name(String name)`
- `RowBuilder spacing(double spacing)`
- `RowBuilder gap(double gap)`
- `RowBuilder padding(DocumentInsets padding)`
- `RowBuilder margin(DocumentInsets margin)`
- `RowBuilder fillColor(DocumentColor fillColor)`
- `RowBuilder stroke(DocumentStroke stroke)`
- `RowBuilder cornerRadius(double radius)`
- `RowBuilder borders(DocumentBorders borders)`
- `RowBuilder verticalAlign(RowVerticalAlign verticalAlign)`
- `RowBuilder arrangement(RowArrangement arrangement)`
- `RowBuilder flexSpacer()`
- `RowBuilder flexSpacer(double grow)`
- `RowBuilder pushRight()`
- `RowBuilder weights(double... weights)`
- `RowBuilder evenWeights()`
- `RowBuilder columns(DocumentRowColumn... columns)`
- `RowBuilder add(DocumentNode node)`
- `RowBuilder addParagraph(Consumer<ParagraphBuilder> spec)`
- `RowBuilder addParagraph(String text)`
- `RowBuilder addParagraph(String text, DocumentTextStyle textStyle)`
- `RowBuilder addText(Consumer<ParagraphBuilder> spec)`
- `RowBuilder addImage(Consumer<ImageBuilder> spec)`
- `RowBuilder addImage(DocumentImageData imageData)`
- `RowBuilder addImage(Path path)`
- `RowBuilder addShape(Consumer<ShapeBuilder> spec)`
- `RowBuilder addLine(Consumer<LineBuilder> spec)`
- `RowBuilder addPageReference(String anchor, DocumentTextStyle textStyle, TextAlign align)`
- `RowBuilder addPageReference(String anchor)`
- `RowBuilder addEllipse(Consumer<EllipseBuilder> spec)`
- `RowBuilder addBarcode(Consumer<BarcodeBuilder> spec)`
- `RowBuilder addSpacer(Consumer<SpacerBuilder> spec)`
- `RowBuilder addSpacer(double width)`
- `RowBuilder addSection(Consumer<SectionBuilder> spec)`
- `RowBuilder addSection(String name, Consumer<SectionBuilder> spec)`
- `RowNode build()`

### SectionBuilder (class)
- `new SectionBuilder()`
- `SectionBuilder keepTogether()`
- `SectionBuilder keepTogether(boolean value)`
- `SectionBuilder keepWithNext()`
- `SectionBuilder keepWithNext(boolean value)`
- `SectionNode build()`

### ShapeBuilder (class)
- `new ShapeBuilder()`
- `ShapeBuilder name(String name)`
- `ShapeBuilder width(double width)`
- `ShapeBuilder height(double height)`
- `ShapeBuilder size(double width, double height)`
- `ShapeBuilder fillColor(Color fillColor)`
- `ShapeBuilder fillColor(DocumentColor fillColor)`
- `ShapeBuilder fill(com.demcha.compose.document.style.DocumentPaint paint)`
- `ShapeBuilder stroke(DocumentStroke stroke)`
- `ShapeBuilder cornerRadius(double radius)`
- `ShapeBuilder cornerRadius(DocumentCornerRadius cornerRadius)`
- `ShapeBuilder link(DocumentLinkOptions linkOptions)`
- `ShapeBuilder linkTarget(DocumentLinkTarget linkTarget)`
- `ShapeBuilder linkTo(String anchor)`
- `ShapeBuilder anchor(String anchor)`
- `ShapeBuilder bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `ShapeBuilder padding(DocumentInsets padding)`
- `ShapeBuilder margin(DocumentInsets margin)`
- `ShapeBuilder transform(DocumentTransform transform)`
- `DocumentTransform currentTransform()`
- `ShapeNode build()`

### ShapeContainerBuilder (class)
- `new ShapeContainerBuilder()`
- `ShapeContainerBuilder name(String name)`
- `ShapeContainerBuilder rectangle(double width, double height)`
- `ShapeContainerBuilder roundedRect(double width, double height, double cornerRadius)`
- `ShapeContainerBuilder roundedRect(double width, double height, DocumentCornerRadius cornerRadius)`
- `ShapeContainerBuilder ellipse(double width, double height)`
- `ShapeContainerBuilder circle(double diameter)`
- `ShapeContainerBuilder diamond(double width, double height)`
- `ShapeContainerBuilder triangle(double width, double height)`
- `ShapeContainerBuilder star(double width, double height)`
- `ShapeContainerBuilder star(double width, double height, int points)`
- `ShapeContainerBuilder arrow(double width, double height, ShapeOutline.Direction direction)`
- `ShapeContainerBuilder chevron(double width, double height, ShapeOutline.Direction direction)`
- `ShapeContainerBuilder path(double width, double height, java.util.List<com.demcha.compose.document.style.DocumentPathSegment> segments)`
- `ShapeContainerBuilder path(double width, double height, com.demcha.compose.document.svg.SvgPath svgPath)`
- `ShapeContainerBuilder outline(ShapeOutline outline)`
- `ShapeContainerBuilder clipPolicy(ClipPolicy clipPolicy)`
- `ShapeContainerBuilder fillColor(DocumentColor fillColor)`
- `ShapeContainerBuilder fillColor(Color fillColor)`
- `ShapeContainerBuilder stroke(DocumentStroke stroke)`
- `ShapeContainerBuilder padding(double padding)`
- `ShapeContainerBuilder padding(DocumentInsets padding)`
- `ShapeContainerBuilder margin(double margin)`
- `ShapeContainerBuilder margin(DocumentInsets margin)`
- `ShapeContainerBuilder transform(DocumentTransform transform)`
- `DocumentTransform currentTransform()`
- `ShapeContainerBuilder layer(DocumentNode node, LayerAlign align)`
- `ShapeContainerBuilder layer(DocumentNode node, LayerAlign align, int zIndex)`
- `ShapeContainerBuilder layer(DocumentNode node)`
- `ShapeContainerBuilder position(DocumentNode node, double offsetX, double offsetY, LayerAlign align)`
- `ShapeContainerBuilder position(DocumentNode node, double offsetX, double offsetY, LayerAlign align, int zIndex)`
- `ShapeContainerBuilder back(DocumentNode node)`
- `ShapeContainerBuilder topLeft(DocumentNode node)`
- `ShapeContainerBuilder topCenter(DocumentNode node)`
- `ShapeContainerBuilder topRight(DocumentNode node)`
- `ShapeContainerBuilder centerLeft(DocumentNode node)`
- `ShapeContainerBuilder center(DocumentNode node)`
- `ShapeContainerBuilder centerRight(DocumentNode node)`
- `ShapeContainerBuilder bottomLeft(DocumentNode node)`
- `ShapeContainerBuilder bottomCenter(DocumentNode node)`
- `ShapeContainerBuilder bottomRight(DocumentNode node)`
- `ShapeContainerNode build()`

### SpacerBuilder (class)
- `new SpacerBuilder()`
- `SpacerBuilder name(String name)`
- `SpacerBuilder width(double width)`
- `SpacerBuilder height(double height)`
- `SpacerBuilder size(double width, double height)`
- `SpacerBuilder grow(double grow)`
- `SpacerBuilder padding(DocumentInsets padding)`
- `SpacerBuilder margin(DocumentInsets margin)`
- `SpacerNode build()`

### TableBuilder (class)
- `new TableBuilder()`
- `TableBuilder name(String name)`
- `TableBuilder columns(DocumentTableColumn... columns)`
- `TableBuilder autoColumns(int count)`
- `TableBuilder addColumn(DocumentTableColumn column)`
- `TableBuilder row(String... values)`
- `TableBuilder rowCells(List<DocumentTableCell> row)`
- `TableBuilder rowCells(DocumentTableCell... row)`
- `TableBuilder header(String... values)`
- `TableBuilder headerRow(String... values)`
- `TableBuilder totalRow(DocumentTableStyle style, String... values)`
- `TableBuilder totalRow(String... values)`
- `TableBuilder zebra(DocumentTableStyle odd, DocumentTableStyle even)`
- `TableBuilder zebra(DocumentColor odd, DocumentColor even)`
- `TableBuilder repeatHeader()`
- `TableBuilder repeatHeader(int rowCount)`
- `TableBuilder headerCells(DocumentTableCell... row)`
- `TableBuilder headerCells(List<DocumentTableCell> row)`
- `TableBuilder rows(String[]... rows)`
- `TableBuilder defaultCellStyle(DocumentTableStyle defaultCellStyle)`
- `TableBuilder headerStyle(DocumentTableStyle style)`
- `TableBuilder rowStyle(int rowIndex, DocumentTableStyle style)`
- `TableBuilder columnStyle(int columnIndex, DocumentTableStyle style)`
- `TableBuilder width(double width)`
- `TableBuilder link(DocumentLinkOptions linkOptions)`
- `TableBuilder linkTarget(DocumentLinkTarget linkTarget)`
- `TableBuilder linkTo(String anchor)`
- `TableBuilder anchor(String anchor)`
- `TableBuilder bookmark(DocumentBookmarkOptions bookmarkOptions)`
- `TableBuilder padding(DocumentInsets padding)`
- `TableBuilder margin(DocumentInsets margin)`
- `TableNode build()`

### TimelineBuilder (class)
- `TimelineBuilder connector(DocumentColor color, double width)`
- `TimelineBuilder gutter(double gutter)`
- `TimelineBuilder markerGap(double gap)`
- `TimelineBuilder markerColumnWeight(double weight)`
- `TimelineBuilder spacing(double spacing)`
- `TimelineBuilder titleStyle(DocumentTextStyle style)`
- `TimelineBuilder metaStyle(DocumentTextStyle style)`
- `TimelineBuilder bodyStyle(DocumentTextStyle style)`
- `TimelineBuilder entry(TimelineMarker marker, Consumer<TimelineEntryBuilder> content)`
- `TimelineBuilder keepTogether()`
- `TimelineBuilder keepEntriesTogether()`

### TimelineEntryBuilder (class)
- `TimelineEntryBuilder title(String title)`
- `TimelineEntryBuilder title(String title, DocumentTextStyle style)`
- `TimelineEntryBuilder titleStyle(DocumentTextStyle style)`
- `TimelineEntryBuilder meta(String meta)`
- `TimelineEntryBuilder meta(String meta, DocumentTextStyle style)`
- `TimelineEntryBuilder metaStyle(DocumentTextStyle style)`
- `TimelineEntryBuilder body(String body)`
- `TimelineEntryBuilder body(String body, DocumentTextStyle style)`
- `TimelineEntryBuilder bodyStyle(DocumentTextStyle style)`
- `TimelineEntryBuilder add(Consumer<SectionBuilder> extra)`

### TimelineMarker (class)
- `TimelineMarker dot(double size, DocumentColor color)`
- `TimelineMarker circle(double size, DocumentColor fill, DocumentStroke stroke)`
- `TimelineMarker numbered(int number, double size, DocumentColor fill, DocumentColor textColor)`
- `TimelineMarker square(double size, DocumentColor fill)`

### TocBuilder (class)
- `new TocBuilder()`
- `TocBuilder title(String title)`
- `TocBuilder titleStyle(DocumentTextStyle style)`
- `TocBuilder entry(String label, String anchor)`
- `TocBuilder leader(DocumentLeader leader)`
- `TocBuilder leaderColor(DocumentColor color)`
- `TocBuilder entryStyle(DocumentTextStyle style)`
- `TocBuilder pageNumberStyle(DocumentTextStyle style)`

### Transformable (interface)


## com.demcha.compose.document.dsl.internal

### BuilderSupport (class)
- `<B> B configure(B builder, Consumer<B> spec)`

### SemanticNameNormalizer (class)
- `String normalize(String raw)`


## com.demcha.compose.document.image

### DocumentImageData (class)
- `DocumentImageData fromBytes(byte[] bytes)`
- `DocumentImageData fromPath(Path path)`
- `DocumentImageData fromPath(String path)`
- `Optional<byte[]> bytes()`
- `Optional<Path> path()`

### DocumentImageFitMode (enum)
- constants: `STRETCH`, `CONTAIN`, `COVER`


## com.demcha.compose.document.node

### AlignNode (record)
- `new AlignNode(DocumentNode child, HorizontalAlign align)`
- `List<DocumentNode> children()`
- `String nodeKind()`

### BarcodeNode (record)
- `new BarcodeNode(String name, DocumentBarcodeOptions barcodeOptions, double width, double height, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform)`
- `new BarcodeNode(String name, DocumentBarcodeOptions barcodeOptions, double width, double height, DocumentInsets padding, DocumentInsets margin)`
- `new BarcodeNode(String name, DocumentBarcodeOptions barcodeOptions, double width, double height, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`

### CanvasChild (record)

### CanvasLayerNode (record)
- `List<DocumentNode> children()`

### ChartNode (record)
- `new ChartNode(ChartSpec spec)`
- `String nodeKind()`

### ContainerNode (record)
- `new ContainerNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders, String anchor)`
- `new ContainerNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders)`
- `new ContainerNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius)`
- `new ContainerNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke)`

### DocumentBarcodeOptions (class)

### DocumentBarcodeType (enum)
- constants: `QR_CODE`, `CODE_128`, `CODE_39`, `EAN_13`, `EAN_8`, `UPC_A`, `PDF_417`, `DATA_MATRIX`

### DocumentBookmarkOptions (record)
- `new DocumentBookmarkOptions(String title)`

### DocumentLinkOptions (record)

### DocumentLinkTarget (interface)

### DocumentNode (interface)

### EllipseNode (record)
- `new EllipseNode(String name, double width, double height, DocumentColor fillColor, DocumentStroke stroke, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform)`
- `new EllipseNode(String name, double width, double height, DocumentColor fillColor, DocumentStroke stroke, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`

### ExternalLinkTarget (record)

### HorizontalAlign (enum)
- constants: `LEFT`, `CENTER`, `RIGHT`

### ImageNode (record)
- `new ImageNode(String name, DocumentImageData imageData, Double width, Double height, Double scale, DocumentImageFitMode fitMode, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform)`
- `new ImageNode(String name, DocumentImageData imageData, Double width, Double height, DocumentInsets padding, DocumentInsets margin)`
- `new ImageNode(String name, DocumentImageData imageData, Double width, Double height, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`
- `new ImageNode(String name, DocumentImageData imageData, Double width, Double height, Double scale, DocumentImageFitMode fitMode, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`

### InlineHighlightRun (record)
- `new InlineHighlightRun(String text, DocumentTextStyle textStyle, InlineBackground background, DocumentLinkOptions linkOptions)`
- `new InlineHighlightRun(String text, DocumentTextStyle textStyle, InlineBackground background)`

### InlineImageAlignment (enum)
- constants: `BASELINE`, `CENTER`, `TEXT_TOP`, `TEXT_BOTTOM`

### InlineImageRun (record)
- `new InlineImageRun(DocumentImageData imageData, double width, double height)`
- `new InlineImageRun(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment)`
- `new InlineImageRun(DocumentImageData imageData, double width, double height, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`

### InlineRun (interface)

### InlineShapeRun (record)
- `new InlineShapeRun(List<ShapeLayer> layers, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `new InlineShapeRun(ShapeOutline outline, DocumentColor fill, DocumentStroke stroke, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`
- `new InlineShapeRun(ShapeOutline outline, DocumentColor fill)`
- `double width()`
- `double height()`
- `InlineShapeRun checkbox(double size, boolean checked, DocumentColor boxColor, DocumentColor checkColor)`
- `InlineShapeRun checkbox(double size, boolean checked, ShapeOutline.CheckmarkStyle markStyle, DocumentColor boxColor, DocumentColor checkColor)`
- `InlineShapeRun checkbox(double size, boolean checked, ShapeOutline mark, DocumentColor boxColor, DocumentColor checkColor)`

### InlineSvgRun (record)
- `new InlineSvgRun(SvgIcon icon, double width, double height)`
- `new InlineSvgRun(SvgIcon icon, double width, double height, InlineImageAlignment alignment, double baselineOffset, DocumentLinkOptions linkOptions)`

### InlineTextRun (record)
- `new InlineTextRun(String text, DocumentTextStyle textStyle, DocumentLinkOptions linkOptions)`
- `new InlineTextRun(String text, DocumentTextStyle textStyle)`
- `new InlineTextRun(String text)`

### InternalLinkTarget (record)

### LayerAlign (enum)
- constants: `TOP_LEFT`, `TOP_CENTER`, `TOP_RIGHT`, `CENTER_LEFT`, `CENTER`, `CENTER_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_CENTER`, `BOTTOM_RIGHT`

### LayerStackNode (record)
- `new LayerStackNode(String name, List<Layer> layers, DocumentInsets padding, DocumentInsets margin)`
- `List<DocumentNode> children()`
- `Layer(DocumentNode node)`
- `Layer(DocumentNode node, LayerAlign align)`
- `Layer(DocumentNode node, LayerAlign align, double offsetX, double offsetY)`
- `Layer back(DocumentNode node)`
- `Layer center(DocumentNode node)`
- `Layer of(DocumentNode node, LayerAlign align)`
- `Layer of(DocumentNode node, LayerAlign align, double offsetX, double offsetY)`

### LineNode (record)
- `new LineNode(String name, double width, double height, double startX, double startY, double endX, double endY, DocumentStroke stroke, DocumentLinkTarget linkTarget, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform, DocumentDashPattern dashPattern, String anchor, DocumentLineCap lineCap, boolean fillWidth)`
- `new LineNode(String name, double width, double height, double startX, double startY, double endX, double endY, DocumentStroke stroke, DocumentLinkTarget linkTarget, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform, DocumentDashPattern dashPattern, String anchor, DocumentLineCap lineCap)`
- `new LineNode(String name, double width, double height, double startX, double startY, double endX, double endY, DocumentStroke stroke, DocumentLinkTarget linkTarget, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform, DocumentDashPattern dashPattern, String anchor)`
- `new LineNode(String name, double width, double height, double startX, double startY, double endX, double endY, DocumentStroke stroke, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform, DocumentDashPattern dashPattern)`
- `new LineNode(String name, double width, double height, double startX, double startY, double endX, double endY, DocumentStroke stroke, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform)`
- `new LineNode(String name, double width, double height, double startX, double startY, double endX, double endY, DocumentStroke stroke, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`

### ListItem (record)
- `ListItem of(String label)`
- `ListItem of(String label, List<ListItem> children)`
- `boolean isLeaf()`

### ListMarker (record)
- `ListMarker bullet()`
- `ListMarker dash()`
- `ListMarker none()`
- `ListMarker custom(String marker)`
- `ListMarker defaultForDepth(int depth)`
- `String normalizeItemText(String value, boolean normalizeMarkers)`
- `boolean isVisible()`
- `String prefix()`

### ListNode (record)
- `new ListNode(String name, List<String> items, ListMarker marker, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, double itemSpacing, String continuationIndent, boolean normalizeMarkers, DocumentInsets padding, DocumentInsets margin)`

### PageBreakNode (record)

### PageReferenceNode (record)
- `new PageReferenceNode(String anchor, DocumentTextStyle textStyle, TextAlign align)`

### ParagraphNode (record)
- `new ParagraphNode(String name, String text, List<InlineRun> inlineRuns, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, String bulletOffset, DocumentTextIndent indentStrategy, DocumentLinkTarget linkTarget, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTextAutoSize autoSize, TextVerticalAlign verticalAlign, String anchor)`
- `new ParagraphNode(String name, String text, List<InlineRun> inlineRuns, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, String bulletOffset, DocumentTextIndent indentStrategy, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTextAutoSize autoSize, TextVerticalAlign verticalAlign)`
- `new ParagraphNode(String name, String text, List<InlineRun> inlineRuns, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, String bulletOffset, DocumentTextIndent indentStrategy, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTextAutoSize autoSize)`
- `new ParagraphNode(String name, String text, List<InlineRun> inlineRuns, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, String bulletOffset, DocumentTextIndent indentStrategy, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`
- `new ParagraphNode(String name, String text, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, String bulletOffset, DocumentTextIndent indentStrategy, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`
- `new ParagraphNode(String name, String text, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, String bulletOffset, DocumentTextIndent indentStrategy, DocumentInsets padding, DocumentInsets margin)`
- `new ParagraphNode(String name, String text, DocumentTextStyle textStyle, TextAlign align, double lineSpacing, DocumentInsets padding, DocumentInsets margin)`
- `List<InlineTextRun> inlineTextRuns()`

### PathNode (record)
- `new PathNode(String name, double width, double height, List<DocumentPathSegment> segments, DocumentColor fillColor, DocumentStroke stroke, DocumentInsets padding, DocumentInsets margin, DocumentDashPattern dashPattern)`
- `new PathNode(String name, double width, double height, List<DocumentPathSegment> segments, DocumentColor fillColor, DocumentPaint fillPaint, DocumentStroke stroke, DocumentPaint strokePaint, DocumentInsets padding, DocumentInsets margin, DocumentDashPattern dashPattern)`
- `String nodeKind()`

### PolygonNode (record)
- `String nodeKind()`

### RowArrangement (enum)
- constants: `START`, `CENTER`, `END`, `SPACE_BETWEEN`, `SPACE_AROUND`, `SPACE_EVENLY`

### RowNode (record)
- `new RowNode(String name, List<DocumentNode> children, List<Double> weights, double gap, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders, List<DocumentRowColumn> columns, RowVerticalAlign verticalAlign)`
- `new RowNode(String name, List<DocumentNode> children, List<Double> weights, double gap, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders, List<DocumentRowColumn> columns)`
- `new RowNode(String name, List<DocumentNode> children, List<Double> weights, double gap, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders)`
- `new RowNode(String name, List<DocumentNode> children, List<Double> weights, double gap, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius)`

### RowVerticalAlign (enum)
- constants: `TOP`, `CENTER`, `BOTTOM`

### SectionNode (record)
- `new SectionNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders, boolean keepTogether, String anchor, DocumentBleed bleed, DocumentBookmarkOptions bookmarkOptions)`
- `new SectionNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders, boolean keepTogether, String anchor, DocumentBleed bleed)`
- `new SectionNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders, boolean keepTogether, String anchor)`
- `new SectionNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders, boolean keepTogether)`
- `new SectionNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentBorders borders)`
- `new SectionNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius)`
- `new SectionNode(String name, List<DocumentNode> children, double spacing, DocumentInsets padding, DocumentInsets margin, DocumentColor fillColor, DocumentStroke stroke)`

### ShapeContainerNode (record)
- `new ShapeContainerNode(String name, ShapeOutline outline, List<LayerStackNode.Layer> layers, ClipPolicy clipPolicy, DocumentColor fillColor, DocumentStroke stroke, DocumentInsets padding, DocumentInsets margin)`
- `List<DocumentNode> children()`

### ShapeLayer (record)
- `new ShapeLayer(ShapeOutline outline, DocumentColor fill)`

### ShapeNode (record)
- `new ShapeNode(String name, double width, double height, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform, DocumentPaint fillPaint)`
- `new ShapeNode(String name, double width, double height, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, DocumentTransform transform)`
- `new ShapeNode(String name, double width, double height, Color fillColor, DocumentStroke stroke, DocumentInsets padding, DocumentInsets margin)`
- `new ShapeNode(String name, double width, double height, DocumentColor fillColor, DocumentStroke stroke, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`
- `new ShapeNode(String name, double width, double height, DocumentColor fillColor, DocumentStroke stroke, DocumentCornerRadius cornerRadius, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`

### SpacerNode (record)
- `new SpacerNode(String name, double width, double height, DocumentInsets padding, DocumentInsets margin)`

### TableNode (record)
- `new TableNode(String name, List<DocumentTableColumn> columns, List<List<DocumentTableCell>> rows, DocumentTableStyle defaultCellStyle, Double width, DocumentInsets padding, DocumentInsets margin)`
- `new TableNode(String name, List<DocumentTableColumn> columns, List<List<DocumentTableCell>> rows, DocumentTableStyle defaultCellStyle, Map<Integer, DocumentTableStyle> rowStyles, Map<Integer, DocumentTableStyle> columnStyles, Double width, DocumentInsets padding, DocumentInsets margin)`
- `new TableNode(String name, List<DocumentTableColumn> columns, List<List<DocumentTableCell>> rows, DocumentTableStyle defaultCellStyle, Map<Integer, DocumentTableStyle> rowStyles, Map<Integer, DocumentTableStyle> columnStyles, Double width, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin)`
- `new TableNode(String name, List<DocumentTableColumn> columns, List<List<DocumentTableCell>> rows, DocumentTableStyle defaultCellStyle, Map<Integer, DocumentTableStyle> rowStyles, Map<Integer, DocumentTableStyle> columnStyles, Double width, DocumentLinkOptions linkOptions, DocumentBookmarkOptions bookmarkOptions, DocumentInsets padding, DocumentInsets margin, int repeatedHeaderRowCount)`

### TextAlign (enum)
- constants: `LEFT`, `CENTER`, `RIGHT`

### TextDirection (enum)
- constants: `LTR`, `RTL`, `AUTO`

### TextVerticalAlign (enum)
- constants: `DEFAULT`, `TOP`, `CENTER`, `BOTTOM`


## com.demcha.compose.document.output

### DocumentDebugOptions (record)
- `DocumentDebugOptions none()`
- `DocumentDebugOptions guides()`
- `DocumentDebugOptions nodeLabels()`
- `DocumentDebugOptions guidesAndNodeLabels()`
- `DocumentDebugOptions withGuides(boolean enabled)`
- `DocumentDebugOptions withNodeLabels(boolean enabled)`
- `DocumentDebugOptions withLabelText(LabelText text)`
- `boolean enabled()`

### DocumentHeaderFooter (class)
- `DocumentHeaderFooter withZone(DocumentHeaderFooterZone zone)`

### DocumentHeaderFooterZone (enum)
- constants: `HEADER`, `FOOTER`

### DocumentMetadata (class)

### DocumentOutputOptions (record)
- `new DocumentOutputOptions(DocumentMetadata metadata, DocumentWatermark watermark, DocumentProtection protection, List<DocumentHeaderFooter> headersAndFooters)`
- `boolean hasAny()`
- constants: `EMPTY`

### DocumentPageNumberStyle (enum)
- constants: `DECIMAL`, `LOWER_ROMAN`, `UPPER_ROMAN`, `LOWER_ALPHA`, `UPPER_ALPHA`

### DocumentPageNumbering (class)
- constants: `DEFAULT`

### DocumentProtection (class)

### DocumentViewerPreferences (class)
- `DocumentViewerPreferences openOutline()`

### DocumentWatermark (class)
- `boolean isTextBased()`
- `boolean isImageBased()`

### DocumentWatermarkLayer (enum)
- constants: `BEHIND_CONTENT`, `ABOVE_CONTENT`

### DocumentWatermarkPosition (enum)
- constants: `CENTER`, `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT`, `TILE`


## com.demcha.compose.document.style

### ClipPolicy (enum)
- constants: `CLIP_BOUNDS`, `CLIP_PATH`, `OVERFLOW_VISIBLE`

### DocumentBleed (record)
- `DocumentBleed none()`
- `DocumentBleed all()`
- `DocumentBleed of(DocumentEdge... edges)`
- `boolean bleeds(DocumentEdge edge)`
- `boolean any()`

### DocumentBorders (record)
- `DocumentBorders all(DocumentStroke stroke)`
- `DocumentBorders bottom(DocumentStroke stroke)`
- `DocumentBorders top(DocumentStroke stroke)`
- `DocumentBorders left(DocumentStroke stroke)`
- `DocumentBorders right(DocumentStroke stroke)`
- `DocumentBorders horizontal(DocumentStroke stroke)`
- `DocumentBorders vertical(DocumentStroke stroke)`
- `boolean hasAny()`
- constants: `NONE`

### DocumentColor (class)
- `DocumentColor of(Color color)`
- `DocumentColor rgb(int red, int green, int blue)`
- `DocumentColor rgba(int red, int green, int blue, int alpha)`
- `DocumentColor withOpacity(double opacity)`
- `Color color()`
- constants: `BLACK`, `DARK_GRAY`, `GRAY`, `LIGHT_GRAY`, `WHITE`, `ROYAL_BLUE`, `ORANGE`

### DocumentCornerRadius (record)
- `new DocumentCornerRadius(double radius)`
- `DocumentCornerRadius of(double radius)`
- `DocumentCornerRadius of(double topLeft, double topRight, double bottomRight, double bottomLeft)`
- `DocumentCornerRadius right(double radius)`
- `DocumentCornerRadius left(double radius)`
- `DocumentCornerRadius top(double radius)`
- `DocumentCornerRadius bottom(double radius)`
- `double radius()`
- `boolean isZero()`
- `boolean isUniform()`
- constants: `ZERO`

### DocumentDashPattern (record)
- `DocumentDashPattern of(double... segments)`
- `boolean isSolid()`
- constants: `NONE`

### DocumentEdge (enum)
- constants: `TOP`, `RIGHT`, `BOTTOM`, `LEFT`

### DocumentInsets (record)
- `DocumentInsets zero()`
- `DocumentInsets of(double value)`
- `DocumentInsets symmetric(double vertical, double horizontal)`
- `DocumentInsets top(double value)`
- `DocumentInsets bottom(double value)`
- `double horizontal()`
- `double vertical()`

### DocumentLeader (enum)
- constants: `NONE`, `DOTS`, `DASHES`

### DocumentLineCap (enum)
- `int pdfCode()`
- constants: `BUTT`, `ROUND`, `SQUARE`

### DocumentLineJoin (enum)
- `int pdfCode()`
- constants: `MITER`, `ROUND`, `BEVEL`

### DocumentPageLayout (enum)
- constants: `SINGLE_PAGE`, `ONE_COLUMN`, `TWO_COLUMN_LEFT`, `TWO_COLUMN_RIGHT`, `TWO_PAGE_LEFT`, `TWO_PAGE_RIGHT`

### DocumentPageMode (enum)
- constants: `USE_NONE`, `USE_OUTLINES`, `USE_THUMBNAILS`, `FULL_SCREEN`, `USE_ATTACHMENTS`

### DocumentPaint (interface)
- `DocumentColor primaryColor()`

### DocumentPathSegment (interface)

### DocumentRowColumn (record)
- `DocumentRowColumn fixed(double points)`
- `DocumentRowColumn auto()`
- `DocumentRowColumn weight(double weight)`

### DocumentSpacing (record)
- `DocumentSpacing zero()`
- `DocumentSpacing of(double value)`

### DocumentStroke (record)
- `DocumentStroke of(DocumentColor color)`
- `DocumentStroke of(DocumentColor color, double width)`
- constants: `DEFAULT_WIDTH`

### DocumentTextAutoSize (record)
- `DocumentTextAutoSize between(double maxSize, double minSize)`
- `DocumentTextAutoSize upTo(double maxSize)`
- constants: `DEFAULT_STEP`, `DEFAULT_MIN_SIZE`

### DocumentTextDecoration (enum)
- constants: `DEFAULT`, `BOLD`, `ITALIC`, `BOLD_ITALIC`, `UNDERLINE`, `STRIKETHROUGH`

### DocumentTextIndent (enum)
- constants: `NONE`, `FIRST_LINE`, `FROM_SECOND_LINE`, `ALL_LINES`

### DocumentTextStyle (record)
- `Builder builder()`
- `DocumentTextStyle withSize(double size)`
- `DocumentTextStyle withColor(DocumentColor color)`
- `Builder fontName(FontName fontName)`
- `Builder size(double size)`
- `Builder decoration(DocumentTextDecoration decoration)`
- `Builder color(DocumentColor color)`
- `DocumentTextStyle build()`
- constants: `DEFAULT`

### DocumentTransform (record)
- `DocumentTransform none()`
- `DocumentTransform rotate(double degrees)`
- `DocumentTransform scale(double uniformFactor)`
- `DocumentTransform scale(double scaleX, double scaleY)`
- `DocumentTransform withRotation(double degrees)`
- `DocumentTransform withScale(double scaleX, double scaleY)`
- `boolean isIdentity()`
- constants: `NONE`

### InlineBackground (record)

### ShapeOutline (interface)

### ShapePoint (record)


## com.demcha.compose.document.svg

### SvgIcon (class)
- `SvgIcon read(Path file)`
- `SvgIcon parse(String svgXml)`
- `List<Layer> layers()`
- `double sourceWidth()`
- `double sourceHeight()`
- `double aspectRatio()`
- `LayerStackNode node(double width)`
- `Layer(SvgPath geometry, DocumentColor fill, DocumentPaint fillPaint, DocumentStroke stroke, DocumentPaint strokePaint, DocumentLineCap lineCap, DocumentLineJoin lineJoin, List<Double> dashArray)`
- `Layer(SvgPath geometry, DocumentColor fill, DocumentStroke stroke)`
- `Layer(SvgPath geometry, DocumentColor fill, DocumentPaint fillPaint, DocumentStroke stroke, DocumentPaint strokePaint)`

### SvgPath (class)
- `SvgPath parse(String d)`
- `SvgPath parse(String d, double minX, double minY, double width, double height)`
- `List<DocumentPathSegment> segments()`
- `double sourceWidth()`
- `double sourceHeight()`
- `double aspectRatio()`


## com.demcha.compose.document.table

### DocumentTableCell (record)
- `new DocumentTableCell(List<String> lines, DocumentTableStyle style, int colSpan, int rowSpan)`
- `new DocumentTableCell(List<String> lines, DocumentTableStyle style, int colSpan)`
- `new DocumentTableCell(List<String> lines, DocumentTableStyle style)`
- `DocumentTableCell text(String text)`
- `DocumentTableCell lines(String... lines)`
- `DocumentTableCell node(DocumentNode child)`
- `DocumentTableCell withStyle(DocumentTableStyle style)`
- `DocumentTableCell colSpan(int span)`
- `DocumentTableCell rowSpan(int span)`
- `boolean hasComposedContent()`

### DocumentTableColumn (record)
- `DocumentTableColumn auto()`
- `DocumentTableColumn fixed(double points)`

### DocumentTableStyle (class)
- `DocumentTableStyle empty()`
- `Builder builder()`
- `DocumentInsets padding()`
- `DocumentColor fillColor()`
- `DocumentStroke stroke()`
- `DocumentTextStyle textStyle()`
- `DocumentTableTextAnchor textAnchor()`
- `Double lineSpacing()`
- `TextDirection direction()`
- `Builder padding(DocumentInsets padding)`
- `Builder padding(double padding)`
- `Builder fillColor(DocumentColor fillColor)`
- `Builder stroke(DocumentStroke stroke)`
- `Builder textStyle(DocumentTextStyle textStyle)`
- `Builder textAnchor(DocumentTableTextAnchor textAnchor)`
- `Builder lineSpacing(double lineSpacing)`
- `Builder direction(TextDirection direction)`
- `DocumentTableStyle build()`

### DocumentTableTextAnchor (enum)
- constants: `DEFAULT`, `CENTER_LEFT`, `CENTER`, `CENTER_RIGHT`, `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT`


## com.demcha.compose.document.templates.api

### DocumentTemplate (interface)


## com.demcha.compose.document.templates.core.identity

### Contact (record)

### ContactLine (class)
- `void centered(SectionBuilder host, PartyIdentity identity, BrandTheme theme)`
- `void centered(SectionBuilder host, PartyIdentity identity, BrandTheme theme, DocumentTextStyle bodyStyleOverride, DocumentTextStyle linkStyleOverride, DocumentTextStyle separatorStyleOverride)`
- `void rightAligned(SectionBuilder host, PartyIdentity identity, BrandTheme theme)`
- `void leftAligned(SectionBuilder host, PartyIdentity identity, BrandTheme theme)`
- `void leftAligned(SectionBuilder host, PartyIdentity identity, BrandTheme theme, DocumentTextStyle bodyStyleOverride, DocumentTextStyle linkStyleOverride, DocumentTextStyle separatorStyleOverride)`
- `void twoRowRightAligned(SectionBuilder host, PartyIdentity identity, BrandTheme theme, DocumentTextStyle bodyStyleOverride, DocumentTextStyle linkStyleOverride, DocumentTextStyle separatorStyleOverride)`
- `void rightAlignedStacked(SectionBuilder host, PartyIdentity identity, BrandTheme theme)`
- `void rightAlignedStacked(SectionBuilder host, PartyIdentity identity, BrandTheme theme, DocumentTextStyle bodyStyleOverride, DocumentTextStyle linkStyleOverride)`
- `void render(SectionBuilder host, PartyIdentity identity, BrandTheme theme, TextAlign alignment, Order order)`

### Headline (class)
- `void spacedCentered(SectionBuilder host, String name, BrandTheme theme)`
- `void uppercaseCentered(SectionBuilder host, String name, BrandTheme theme)`
- `void uppercaseCentered(SectionBuilder host, String name, BrandTheme theme, DocumentTextStyle styleOverride)`
- `void uppercaseLeftAligned(SectionBuilder host, String name, BrandTheme theme)`
- `void uppercaseLeftAligned(SectionBuilder host, String name, BrandTheme theme, DocumentTextStyle styleOverride)`
- `void rightAligned(SectionBuilder host, String name, BrandTheme theme)`
- `void rightAligned(SectionBuilder host, String name, BrandTheme theme, DocumentTextStyle styleOverride)`
- `void render(SectionBuilder host, String name, BrandTheme theme, TextAlign alignment, boolean spacedCaps)`
- `void render(SectionBuilder host, String name, BrandTheme theme, TextAlign alignment, boolean spacedCaps, DocumentTextStyle styleOverride)`

### Link (record)
- `Link of(String label, String url)`

### Masthead (class)
- `void centered(SectionBuilder host, PartyIdentity identity, BrandTheme theme, Style style)`
- `Style defaults(BrandTheme theme)`
- `Builder builder()`
- `Builder nameStyle(DocumentTextStyle value)`
- `Builder titleStyle(DocumentTextStyle value)`
- `Builder metaStyle(DocumentTextStyle value)`
- `Builder linkStyle(DocumentTextStyle value)`
- `Builder separatorStyle(DocumentTextStyle value)`
- `Builder metaJoiner(String value)`
- `Builder lineMargin(DocumentInsets value)`
- `Style build()`

### PartyIdentity (interface)

### Subheadline (class)
- `void centeredSpacedCaps(SectionBuilder host, String text, DocumentTextStyle style)`

### SvgGlyph (class)
- `SvgGlyph fromResource(String resourcePath)`
- `ShapeOutline outline(double width)`
- `double aspectRatio()`


## com.demcha.compose.document.templates.core.text

### MarkdownInline (class)
- `void append(RichText rich, String text, DocumentTextStyle baseStyle)`
- `void appendTrimmed(RichText rich, String text, DocumentTextStyle baseStyle)`
- `void appendTransformed(RichText rich, String text, DocumentTextStyle baseStyle, UnaryOperator<String> displayTransform)`
- `void appendUpperCased(RichText rich, String text, DocumentTextStyle baseStyle)`
- `void appendPlainIfPresent(RichText rich, String prefix, String value, DocumentTextStyle style)`
- `void appendIfPresent(RichText rich, String prefix, String value, DocumentTextStyle style)`
- `String plainText(String value)`

### MarkdownText (class)
- `List<InlineRun> parse(String text, DocumentTextStyle baseStyle)`

### RichParagraphRenderer (class)
- `void render(SectionBuilder host, String text, DocumentTextStyle style, double lineSpacing, DocumentInsets margin)`
- `void render(SectionBuilder host, String text, DocumentTextStyle style, double lineSpacing, DocumentInsets margin, TextAlign align)`

### TextOrnaments (class)
- `String spacedUpper(String value)`
- `String joinPipe(String... parts)`

### TextStyles (class)
- `DocumentTextStyle of(FontName font, double size, DocumentTextDecoration decoration, DocumentColor color)`


## com.demcha.compose.document.templates.core.theme

### BrandTheme (record)
- `new BrandTheme(Palette palette, Typography typography, Spacing spacing)`
- `BrandTheme boxedClassic()`
- `BrandTheme modernProfessional()`
- `BrandTheme centeredHeadline()`
- `BrandTheme classicSerif()`
- `BrandTheme nordicClean()`
- `BrandTheme compactMono()`
- `BrandTheme blueBanner()`
- `BrandTheme editorialBlue()`
- `BrandTheme sidebarPortrait()`
- `BrandTheme monogramSidebar()`
- `BrandTheme engineeringResume()`
- `BrandTheme timelineMinimal()`
- `BrandTheme panel()`
- `BrandTheme executive()`
- `BrandTheme mintEditorial()`
- `BrandTheme invoiceModern()`
- `BrandTheme proposalModern()`
- `DocumentTextStyle headlineStyle()`
- `DocumentTextStyle bannerStyle()`
- `DocumentTextStyle contactStyle()`
- `DocumentTextStyle contactSeparatorStyle()`
- `DocumentTextStyle bodyStyle()`
- `DocumentTextStyle bodyBoldStyle()`
- `DocumentTextStyle entryTitleStyle()`
- `DocumentTextStyle entryDateStyle()`
- `DocumentTextStyle entrySubtitleStyle()`

### Decoration (record)
- `Decoration classic()`
- `Decoration blueBanner()`
- `Decoration compactMono()`

### Palette (record)
- `new Palette(DocumentColor ink, DocumentColor muted, DocumentColor rule, DocumentColor banner)`
- `Palette classic()`
- `Palette centeredHeadline()`
- `Palette classicSerif()`
- `Palette nordicClean()`
- `Palette compactMono()`
- `Palette blueBanner()`
- `Palette editorialBlue()`
- `Palette sidebarPortrait()`
- `Palette monogramSidebar()`
- `Palette engineeringResume()`
- `Palette timelineMinimal()`
- `Palette panel()`
- `Palette executive()`
- `Palette mintEditorial()`
- `Palette invoiceModern()`

### Spacing (record)
- `new Spacing(double pageFlowSpacing, double sectionBodySpacing, DocumentInsets sectionBodyPadding, DocumentInsets headlinePadding, DocumentInsets contactPadding, double bannerCornerRadius, double bannerInnerPadding, DocumentInsets bannerMargin, double accentRuleWidth, double paragraphMarginTop, double entryHeaderRowSpacing, double entryTitleWeight, double entryDateWeight)`
- `Spacing classic()`
- `Spacing centeredHeadline()`
- `Spacing classicSerif()`
- `Spacing nordicClean()`
- `Spacing compactMono()`
- `Spacing modernProfessional()`
- `Spacing blueBanner()`
- `Spacing editorialBlue()`
- `Spacing sidebarPortrait()`
- `Spacing monogramSidebar()`
- `Spacing engineeringResume()`
- `Spacing timelineMinimal()`
- `Spacing panel()`
- `Spacing executive()`
- `Spacing mintEditorial()`
- `Spacing invoiceModern()`

### Typography (record)
- `Typography classic()`
- `Typography modernProfessional()`
- `Typography centeredHeadline()`
- `Typography classicSerif()`
- `Typography nordicClean()`
- `Typography compactMono()`
- `Typography blueBanner()`
- `Typography editorialBlue()`
- `Typography sidebarPortrait()`
- `Typography monogramSidebar()`
- `Typography engineeringResume()`
- `Typography timelineMinimal()`
- `Typography panel()`
- `Typography executive()`
- `Typography mintEditorial()`
- `Typography invoiceModern()`
- `Typography proposalModern()`


## com.demcha.compose.document.templates.core.widgets

### AccentStrip (class)
- `DocumentNode left(DocumentColor color, double width, double height)`
- `DocumentNode right(DocumentColor color, double width, double height)`
- `DocumentNode top(DocumentColor color, double width, double height)`
- `DocumentNode bottom(DocumentColor color, double width, double height)`
- `DocumentNode rect(DocumentColor color, double width, double height)`

### CardWidget (class)
- `void render(SectionBuilder parent, String name, Style style, Consumer<SectionBuilder> content)`
- `void render(PageFlowBuilder flow, String name, Style style, Consumer<SectionBuilder> content)`
- `Builder builder()`
- `Builder spacing(double value)`
- `Builder padding(DocumentInsets value)`
- `Builder fillColor(DocumentColor value)`
- `Builder stroke(DocumentStroke value)`
- `Builder cornerRadius(double value)`
- `Builder cornerRadius(DocumentCornerRadius value)`
- `Style build()`

### Divider (class)
- `DocumentNode thin(DocumentColor color, double width)`
- `DocumentNode thick(DocumentColor color, double width)`
- `DocumentNode dashed(DocumentColor color, double width)`
- `DocumentNode dottedAccent(DocumentColor color, double width)`
- `DocumentNode custom(DocumentColor color, double width, double thickness)`
- constants: `THIN_THICKNESS`, `THICK_THICKNESS`

### Spacer (class)
- `DocumentNode small()`
- `DocumentNode medium()`
- `DocumentNode large()`
- `DocumentNode height(double height)`
- `DocumentNode size(double width, double height)`
- constants: `SMALL`, `MEDIUM`, `LARGE`

### TableWidget (class)
- `void fixed(SectionBuilder host, List<List<String>> rows, double width, Style style)`
- `void grid(SectionBuilder host, List<String> cells, double width, Style style)`
- `Builder builder()`
- `Builder name(String value)`
- `Builder columns(int value)`
- `Builder cellPadding(DocumentInsets value)`
- `Builder border(DocumentColor color, double width)`
- `Builder cellStroke(DocumentStroke value)`
- `Builder cellFillColor(DocumentColor value)`
- `Builder zebraFillColor(DocumentColor value)`
- `Builder textStyle(DocumentTextStyle value)`
- `Builder lineSpacing(Double value)`
- `Builder widthAdjustment(double value)`
- `Style build()`

### TimelineAxisWidget (class)
- `void render(SectionBuilder host, Style style)`
- `void render(SectionBuilder host, Style style, double totalHeight)`
- `Builder builder()`
- `Builder toBuilder()`
- `Builder marker(Marker value)`
- `Builder markerSize(double value)`
- `Builder markerFillColor(DocumentColor value)`
- `Builder markerStroke(DocumentStroke value)`
- `Builder segmentLength(double value)`
- `Builder segmentCount(int value)`
- `Builder lineColor(DocumentColor value)`
- `Builder lineThickness(double value)`
- `Builder padding(DocumentInsets value)`
- `Style build()`


## com.demcha.compose.document.templates.coverletter.components

### LetterBody (class)
- `void render(SectionBuilder host, CoverLetterDocument doc, BrandTheme theme)`
- `void render(SectionBuilder host, CoverLetterDocument doc, BrandTheme theme, double bodySize)`


## com.demcha.compose.document.templates.coverletter.data

### CoverLetterDocument (record)
- `Builder builder()`
- `Builder identity(CvIdentity value)`
- `Builder greeting(String value)`
- `Builder paragraph(String value)`
- `Builder closing(String value)`
- `CoverLetterDocument build()`


## com.demcha.compose.document.templates.coverletter.presets

### BlueBannerLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### BoxedSectionsLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### CenteredHeadlineLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### ClassicSerifLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### CompactMonoLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### EditorialBlueLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### EngineeringResumeLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### ExecutiveLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### MintEditorialLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `DocumentTemplate<CoverLetterDocument> create(Options options)`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme, Options options)`
- `Options defaults()`
- `Builder builder()`
- `Builder accentColor(DocumentColor value)`
- `Builder ruleColor(DocumentColor value)`
- `Builder nameColor(DocumentColor value)`
- `Builder headerBandColor(DocumentColor value)`
- `Options build()`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### ModernProfessionalLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### MonogramSidebarLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### NordicCleanLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### PanelLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### SidebarPortraitLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### TimelineMinimalLetter (class)
- `DocumentTemplate<CoverLetterDocument> create()`
- `DocumentTemplate<CoverLetterDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CoverLetterDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`


## com.demcha.compose.document.templates.cv.components

### EntryCompactRenderer (class)
- `void twoColumnTitleDateBody(SectionBuilder host, CvEntry entry, String rowName, DocumentTextStyle titleStyle, DocumentTextStyle dateStyle, DocumentTextStyle subtitleStyle, DocumentTextStyle bodyStyle, double rowSpacing, double titleWeight, double dateWeight, DocumentInsets subtitleMargin, DocumentInsets bodyMargin, double bodyLineSpacing, boolean uppercaseTitle)`
- `void slashMeta(SectionBuilder host, CvEntry entry, DocumentTextStyle titleStyle, DocumentTextStyle metaStyle, double lineSpacing, DocumentInsets margin)`
- `void slashSubtitleDate(SectionBuilder host, CvEntry entry, DocumentTextStyle titleStyle, DocumentTextStyle subtitleStyle, DocumentTextStyle dateStyle, double lineSpacing, DocumentInsets margin)`
- `void titleDateBody(SectionBuilder host, CvEntry entry, DocumentTextStyle titleStyle, DocumentTextStyle dateStyle, DocumentTextStyle subtitleStyle, DocumentTextStyle bodyStyle, String datePrefix, double headerLineSpacing, DocumentInsets headerMargin, DocumentInsets subtitleMargin, DocumentInsets bodyMargin, double bodyLineSpacing, boolean uppercaseTitle)`
- `void titleSubtitleDateBody(SectionBuilder host, CvEntry entry, DocumentTextStyle titleStyle, DocumentTextStyle subtitleStyle, DocumentTextStyle dateStyle, DocumentTextStyle bodyStyle, String subtitlePrefix, String datePrefix, double headerLineSpacing, DocumentInsets headerMargin, DocumentInsets bodyMargin, double bodyLineSpacing)`

### EntryRenderer (class)
- `void render(SectionBuilder section, CvEntry entry, BrandTheme theme)`

### LabelValueRenderer (class)
- `void render(SectionBuilder host, String label, String value, DocumentTextStyle labelStyle, DocumentTextStyle valueStyle, double lineSpacing, DocumentInsets margin)`

### ParagraphRenderer (class)
- `void render(SectionBuilder section, String text, BrandTheme theme)`

### ProjectLabel (record)
- `ProjectLabel parse(String value)`

### ProjectRenderer (class)
- `void inline(SectionBuilder host, CvRow row, DocumentTextStyle titleStyle, DocumentTextStyle stackStyle, DocumentTextStyle bodyStyle, double lineSpacing, DocumentInsets margin)`
- `void plainInline(SectionBuilder host, CvRow row, DocumentTextStyle labelStyle, DocumentTextStyle bodyStyle, double lineSpacing, DocumentInsets margin, String delimiter)`
- `void titleThenBody(SectionBuilder host, CvRow row, DocumentTextStyle titleStyle, DocumentTextStyle stackStyle, DocumentTextStyle bodyStyle, double bodyLineSpacing, DocumentInsets titleMargin, DocumentInsets bodyMargin)`

### RowRenderer (class)
- `void render(SectionBuilder section, CvRow row, RowStyle style, BrandTheme theme)`

### SectionAllocation (class)
- `SectionAllocation of(List<CvSection> sections)`
- `CvSection claim(List<String> keys)`
- `List<CvSection> remaining()`
- `String titleOr(CvSection section, String fallback)`

### SectionDispatcher (class)
- `void renderBody(SectionBuilder host, CvSection section, BrandTheme theme)`

### SectionLookup (class)
- `CvSection firstMatching(List<CvSection> sections, List<String> keys)`
- `boolean hasContent(CvSection section)`
- `boolean titleContains(String title, String key)`
- `String normalize(String value)`

### SkillLineRenderer (class)
- `void limitedInline(SectionBuilder host, SkillGroup group, int limit, DocumentTextStyle labelStyle, DocumentTextStyle valueStyle, double lineSpacing, DocumentInsets margin, String labelSuffix)`

### SkillTableRenderer (class)
- `void grid(SectionBuilder host, List<SkillGroup> groups, double width, TableWidget.Style style, String bulletPrefix)`

### SkillsRenderer (class)
- `void render(SectionBuilder section, SkillsSection skills, BrandTheme theme)`


## com.demcha.compose.document.templates.cv.data

### CvDocument (record)
- `CvDocument ofMainSections(CvIdentity identity, List<CvSection> sections)`
- `List<CvSection> sections()`
- `List<CvSection> sectionsIn(Slot slot)`
- `Slot slotOf(CvSection section)`
- `Builder builder()`
- `Builder identity(CvIdentity value)`
- `Builder section(CvSection section)`
- `Builder section(Slot slot, CvSection section)`
- `Builder sections(CvSection... values)`
- `Builder sections(Slot slot, CvSection... values)`
- `Builder sections(List<CvSection> values)`
- `Builder placement(Placement placement)`
- `CvDocument build()`

### CvEntry (record)

### CvIdentity (record)
- `new CvIdentity(CvName name, Contact contact, List<Link> links)`
- `String displayName()`
- `String tagline()`
- `Builder builder()`
- `Builder name(CvName value)`
- `Builder name(String first, String last)`
- `Builder name(String first, String middle, String last)`
- `Builder jobTitle(String value)`
- `Builder contact(Contact value)`
- `Builder contact(String phone, String email, String address)`
- `Builder link(Link link)`
- `Builder link(String label, String url)`
- `CvIdentity build()`

### CvName (record)
- `CvName of(String first, String last)`
- `Optional<String> middleName()`
- `String full()`

### CvRow (record)

### CvSection (interface)

### CvSkill (record)
- `CvSkill of(String name)`
- `CvSkill of(String name, double level)`

### EntriesSection (record)
- `Builder builder(String title)`
- `Builder entry(String title, String subtitle, String date, String body)`
- `Builder entry(CvEntry entry)`
- `EntriesSection build()`

### ParagraphSection (record)

### RowStyle (enum)
- constants: `PLAIN`, `BULLETED`, `BULLETED_STACKED`

### RowsSection (record)
- `Builder builder(String title, RowStyle style)`
- `Builder row(String label, String body)`
- `Builder row(CvRow row)`
- `RowsSection build()`

### SkillGroup (record)
- `SkillGroup of(String category, String... skills)`
- `SkillGroup ofNames(String category, List<String> skills)`
- `List<String> skills()`
- `String skillsInline()`

### SkillsSection (record)
- `Builder builder(String title)`
- `SkillsSection of(String title, SkillGroup... groups)`
- `Builder group(SkillGroup group)`
- `Builder group(String category, List<String> skills)`
- `Builder group(String category, String... skills)`
- `Builder leveledGroup(String category, List<CvSkill> entries)`
- `SkillsSection build()`

### Slot (enum)
- constants: `MAIN`, `SIDEBAR`, `FOOTER`


## com.demcha.compose.document.templates.cv.presets

### BlueBanner (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### BoxedSections (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### CenteredHeadline (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### ClassicSerif (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### CompactMono (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### EditorialBlue (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### EngineeringResume (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### Executive (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### MinimalUnderlined (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### MintEditorial (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `DocumentTemplate<CvDocument> create(Options options)`
- `DocumentTemplate<CvDocument> create(BrandTheme theme, Options options)`
- `Options defaults()`
- `Builder builder()`
- `Builder accentColor(DocumentColor value)`
- `Builder ruleColor(DocumentColor value)`
- `Builder nameColor(DocumentColor value)`
- `Builder headerBandColor(DocumentColor value)`
- `Options build()`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### ModernProfessional (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### MonogramSidebar (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `DocumentTemplate<CvDocument> create(BrandTheme theme, Options options)`
- `Options defaults()`
- `Builder builder()`
- `Builder sidebarFillColor(DocumentColor value)`
- `Builder mainFillColor(DocumentColor value)`
- `Builder accentColor(DocumentColor value)`
- `Builder monogramRingColor(DocumentColor value)`
- `Options build()`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### NordicClean (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `DocumentTemplate<CvDocument> create(BrandTheme theme, Options options)`
- `Options defaults()`
- `Builder builder()`
- `Builder railSide(RailSide value)`
- `Builder accentColor(DocumentColor value)`
- `Builder railFillColor(DocumentColor value)`
- `Builder profileFillColor(DocumentColor value)`
- `Options build()`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### Panel (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### SidebarPortrait (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `DocumentTemplate<CvDocument> create(BrandTheme theme, Options options)`
- `Options defaults()`
- `Builder builder()`
- `Builder sidebarFillColor(DocumentColor value)`
- `Builder mainFillColor(DocumentColor value)`
- `Builder accentColor(DocumentColor value)`
- `Options build()`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`

### TimelineMinimal (class)
- `DocumentTemplate<CvDocument> create()`
- `DocumentTemplate<CvDocument> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, CvDocument doc)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`


## com.demcha.compose.document.templates.cv.widgets

### FlowSectionHeader (class)
- `void banner(PageFlowBuilder flow, String name, String title, double ruleWidth, BrandTheme theme, DocumentTextStyle titleStyle, DocumentInsets topRuleMargin, DocumentInsets bottomRuleMargin)`
- `void banner(PageFlowBuilder flow, String name, String title, double ruleWidth, BrandTheme theme, DocumentTextStyle titleStyle, DocumentColor ruleColor, DocumentInsets topRuleMargin, DocumentInsets bottomRuleMargin)`
- `void label(PageFlowBuilder flow, String name, String title, double ruleWidth, BrandTheme theme, DocumentTextStyle titleStyle, DocumentInsets topRuleMargin, DocumentInsets titlePadding, DocumentInsets bottomRuleMargin, boolean withTopRule)`
- `void label(PageFlowBuilder flow, String name, String title, double ruleWidth, BrandTheme theme, DocumentTextStyle titleStyle, DocumentColor ruleColor, DocumentInsets topRuleMargin, DocumentInsets titlePadding, DocumentInsets bottomRuleMargin, boolean withTopRule)`

### IconTextRow (class)
- `void render(SectionBuilder host, SvgGlyph glyph, DocumentColor glyphColor, double iconSize, String text, DocumentTextStyle style, DocumentLinkOptions link, DocumentInsets margin)`
- `void render(SectionBuilder host, DocumentImageData icon, double iconSize, String text, DocumentTextStyle style, DocumentLinkOptions link, DocumentInsets margin)`

### ProfileBand (class)
- `void render(PageFlowBuilder flow, String name, String title, String body, Style style)`
- `void render(SectionBuilder host, String title, String body, Style style)`
- `Style defaults()`
- `Builder builder()`
- `Builder spacing(double value)`
- `Builder padding(DocumentInsets value)`
- `Builder fillColor(DocumentColor value)`
- `Builder cornerRadius(DocumentCornerRadius value)`
- `Builder accentLeft(DocumentColor color, double width)`
- `Builder accentTop(DocumentColor color, double width)`
- `Builder accentBottom(DocumentColor color, double width)`
- `Builder titleStyle(DocumentTextStyle value)`
- `Builder titleAlign(TextAlign value)`
- `Builder transformTitle(boolean value)`
- `Builder bodyStyle(DocumentTextStyle value)`
- `Builder bodyAlign(TextAlign value)`
- `Builder bodyLineSpacing(double value)`
- `Style build()`

### SectionHeader (class)
- `void banner(SectionBuilder host, String title, BrandTheme theme)`
- `void fullWidthBanner(SectionBuilder host, String title, BrandTheme theme)`
- `void fullWidthBanner(SectionBuilder host, String title, BrandTheme theme, DocumentTextStyle titleStyleOverride)`
- `void underlined(SectionBuilder host, String title, BrandTheme theme)`
- `void flat(SectionBuilder host, String title, DocumentColor color, BrandTheme theme)`
- `void flatSpacedCaps(SectionBuilder host, String title, DocumentColor color, BrandTheme theme, DocumentTextStyle titleStyle)`
- `void tickLabel(SectionBuilder host, String title, BrandTheme theme, DocumentColor color, double tickWidth)`
- `void tickLabel(SectionBuilder host, String title, BrandTheme theme, DocumentColor color, double tickWidth, DocumentTextStyle titleStyle)`
- `void upperRule(SectionBuilder host, String title, BrandTheme theme, DocumentTextStyle titleStyle, DocumentColor ruleColor, double ruleWidth)`
- `void spacedCapsRule(SectionBuilder host, String title, BrandTheme theme, DocumentTextStyle titleStyle, DocumentColor ruleColor, double ruleWidth, double ruleThickness, DocumentInsets ruleMargin)`

### SectionModule (class)
- `void tick(SectionBuilder parent, String name, String title, BrandTheme theme, DocumentColor color, double tickWidth, DocumentTextStyle titleStyle, Consumer<SectionBuilder> body)`
- `void upperRule(SectionBuilder parent, String name, String title, BrandTheme theme, DocumentTextStyle titleStyle, DocumentColor ruleColor, double ruleWidth, Consumer<SectionBuilder> body)`

### SkillBar (class)
- `void render(SectionBuilder host, CvSkill skill, double trackWidth, BrandTheme theme)`


## com.demcha.compose.document.templates.data.invoice

### InvoiceData (record)
- `Builder builder()`
- `Builder title(String title)`
- `Builder invoiceNumber(String invoiceNumber)`
- `Builder issueDate(String issueDate)`
- `Builder dueDate(String dueDate)`
- `Builder reference(String reference)`
- `Builder status(String status)`
- `Builder fromParty(InvoiceParty fromParty)`
- `Builder fromParty(Consumer<InvoiceParty.Builder> spec)`
- `Builder billToParty(InvoiceParty billToParty)`
- `Builder billToParty(Consumer<InvoiceParty.Builder> spec)`
- `Builder lineItems(List<InvoiceLineItem> lineItems)`
- `Builder addLineItem(InvoiceLineItem lineItem)`
- `Builder lineItem(Consumer<InvoiceLineItem.Builder> spec)`
- `Builder lineItem(String description, String details, String quantity, String unitPrice, String amount)`
- `Builder summaryRows(List<InvoiceSummaryRow> summaryRows)`
- `Builder addSummaryRow(InvoiceSummaryRow summaryRow)`
- `Builder summaryRow(Consumer<InvoiceSummaryRow.Builder> spec)`
- `Builder summaryRow(String label, String value)`
- `Builder totalRow(String label, String value)`
- `Builder notes(List<String> notes)`
- `Builder note(String note)`
- `Builder paymentTerms(List<String> paymentTerms)`
- `Builder paymentTerm(String paymentTerm)`
- `Builder footerNote(String footerNote)`
- `InvoiceData build()`

### InvoiceDocumentSpec (record)
- `InvoiceDocumentSpec from(InvoiceData invoice)`
- `Builder builder()`
- `Builder title(String title)`
- `Builder invoiceNumber(String invoiceNumber)`
- `Builder issueDate(String issueDate)`
- `Builder dueDate(String dueDate)`
- `Builder reference(String reference)`
- `Builder status(String status)`
- `Builder fromParty(InvoiceParty fromParty)`
- `Builder fromParty(Consumer<InvoiceParty.Builder> spec)`
- `Builder billToParty(InvoiceParty billToParty)`
- `Builder billToParty(Consumer<InvoiceParty.Builder> spec)`
- `Builder lineItems(List<InvoiceLineItem> lineItems)`
- `Builder addLineItem(InvoiceLineItem lineItem)`
- `Builder lineItem(Consumer<InvoiceLineItem.Builder> spec)`
- `Builder lineItem(String description, String details, String quantity, String unitPrice, String amount)`
- `Builder summaryRows(List<InvoiceSummaryRow> summaryRows)`
- `Builder addSummaryRow(InvoiceSummaryRow summaryRow)`
- `Builder summaryRow(Consumer<InvoiceSummaryRow.Builder> spec)`
- `Builder summaryRow(String label, String value)`
- `Builder totalRow(String label, String value)`
- `Builder notes(List<String> notes)`
- `Builder note(String note)`
- `Builder paymentTerms(List<String> paymentTerms)`
- `Builder paymentTerm(String paymentTerm)`
- `Builder footerNote(String footerNote)`
- `InvoiceDocumentSpec build()`

### InvoiceLineItem (record)
- `Builder builder()`
- `Builder description(String description)`
- `Builder details(String details)`
- `Builder quantity(String quantity)`
- `Builder unitPrice(String unitPrice)`
- `Builder amount(String amount)`
- `InvoiceLineItem build()`

### InvoiceParty (record)
- `Builder builder()`
- `Builder name(String name)`
- `Builder addressLines(List<String> addressLines)`
- `Builder addressLines(String... addressLines)`
- `Builder addAddressLine(String addressLine)`
- `Builder email(String email)`
- `Builder phone(String phone)`
- `Builder taxId(String taxId)`
- `InvoiceParty build()`

### InvoiceSummaryRow (record)
- `Builder builder()`
- `Builder label(String label)`
- `Builder value(String value)`
- `Builder emphasized(boolean emphasized)`
- `InvoiceSummaryRow build()`


## com.demcha.compose.document.templates.data.proposal

### ProposalData (record)
- `Builder builder()`
- `Builder title(String title)`
- `Builder proposalNumber(String proposalNumber)`
- `Builder preparedDate(String preparedDate)`
- `Builder validUntil(String validUntil)`
- `Builder projectTitle(String projectTitle)`
- `Builder executiveSummary(String executiveSummary)`
- `Builder sender(ProposalParty sender)`
- `Builder sender(Consumer<ProposalParty.Builder> spec)`
- `Builder recipient(ProposalParty recipient)`
- `Builder recipient(Consumer<ProposalParty.Builder> spec)`
- `Builder sections(List<ProposalSection> sections)`
- `Builder addSection(ProposalSection section)`
- `Builder section(Consumer<ProposalSection.Builder> spec)`
- `Builder section(String title, String... paragraphs)`
- `Builder timeline(List<ProposalTimelineItem> timeline)`
- `Builder addTimelineItem(ProposalTimelineItem item)`
- `Builder timelineItem(Consumer<ProposalTimelineItem.Builder> spec)`
- `Builder timelineItem(String phase, String duration, String details)`
- `Builder pricingRows(List<ProposalPricingRow> pricingRows)`
- `Builder addPricingRow(ProposalPricingRow pricingRow)`
- `Builder pricingRow(Consumer<ProposalPricingRow.Builder> spec)`
- `Builder pricingRow(String label, String description, String amount)`
- `Builder emphasizedPricingRow(String label, String description, String amount)`
- `Builder acceptanceTerms(List<String> acceptanceTerms)`
- `Builder acceptanceTerm(String acceptanceTerm)`
- `Builder footerNote(String footerNote)`
- `ProposalData build()`

### ProposalDocumentSpec (record)
- `ProposalDocumentSpec from(ProposalData proposal)`
- `Builder builder()`
- `Builder title(String title)`
- `Builder proposalNumber(String proposalNumber)`
- `Builder preparedDate(String preparedDate)`
- `Builder validUntil(String validUntil)`
- `Builder projectTitle(String projectTitle)`
- `Builder executiveSummary(String executiveSummary)`
- `Builder sender(ProposalParty sender)`
- `Builder sender(Consumer<ProposalParty.Builder> spec)`
- `Builder recipient(ProposalParty recipient)`
- `Builder recipient(Consumer<ProposalParty.Builder> spec)`
- `Builder sections(List<ProposalSection> sections)`
- `Builder addSection(ProposalSection section)`
- `Builder section(Consumer<ProposalSection.Builder> spec)`
- `Builder section(String title, String... paragraphs)`
- `Builder timeline(List<ProposalTimelineItem> timeline)`
- `Builder addTimelineItem(ProposalTimelineItem item)`
- `Builder timelineItem(Consumer<ProposalTimelineItem.Builder> spec)`
- `Builder timelineItem(String phase, String duration, String details)`
- `Builder pricingRows(List<ProposalPricingRow> pricingRows)`
- `Builder addPricingRow(ProposalPricingRow pricingRow)`
- `Builder pricingRow(Consumer<ProposalPricingRow.Builder> spec)`
- `Builder pricingRow(String label, String description, String amount)`
- `Builder emphasizedPricingRow(String label, String description, String amount)`
- `Builder acceptanceTerms(List<String> acceptanceTerms)`
- `Builder acceptanceTerm(String acceptanceTerm)`
- `Builder footerNote(String footerNote)`
- `ProposalDocumentSpec build()`

### ProposalParty (record)
- `Builder builder()`
- `Builder name(String name)`
- `Builder addressLines(List<String> addressLines)`
- `Builder addressLines(String... addressLines)`
- `Builder addAddressLine(String addressLine)`
- `Builder email(String email)`
- `Builder phone(String phone)`
- `Builder website(String website)`
- `ProposalParty build()`

### ProposalPricingRow (record)
- `Builder builder()`
- `Builder label(String label)`
- `Builder description(String description)`
- `Builder amount(String amount)`
- `Builder emphasized(boolean emphasized)`
- `ProposalPricingRow build()`

### ProposalSection (record)
- `Builder builder()`
- `Builder title(String title)`
- `Builder paragraphs(List<String> paragraphs)`
- `Builder paragraphs(String... paragraphs)`
- `Builder addParagraph(String paragraph)`
- `ProposalSection build()`

### ProposalTimelineItem (record)
- `Builder builder()`
- `Builder phase(String phase)`
- `Builder duration(String duration)`
- `Builder details(String details)`
- `ProposalTimelineItem build()`


## com.demcha.compose.document.templates.data.schedule

### ScheduleAssignment (record)
- `Builder builder()`
- `Builder personId(String personId)`
- `Builder dayId(String dayId)`
- `Builder categoryId(String categoryId)`
- `Builder slots(List<ScheduleSlot> slots)`
- `Builder slots(ScheduleSlot... slots)`
- `Builder addSlot(ScheduleSlot slot)`
- `Builder slot(String start, String end)`
- `Builder note(String note)`
- `ScheduleAssignment build()`

### ScheduleCategory (record)
- `ScheduleCategory of(String id, String label, Color fillColor, Color borderColor)`
- `ScheduleCategory of(String id, String label, Color fillColor, Color textColor, Color borderColor)`
- `Builder builder()`
- `Builder id(String id)`
- `Builder label(String label)`
- `Builder fillColor(Color fillColor)`
- `Builder textColor(Color textColor)`
- `Builder borderColor(Color borderColor)`
- `ScheduleCategory build()`

### ScheduleDay (record)
- `ScheduleDay of(String id, String label, String headerNote, String headerCategoryId)`
- `Builder builder()`
- `Builder id(String id)`
- `Builder label(String label)`
- `Builder headerNote(String headerNote)`
- `Builder headerCategoryId(String headerCategoryId)`
- `ScheduleDay build()`

### ScheduleMetricRow (record)
- `ScheduleMetricRow of(String label, String... dayValues)`
- `Builder builder()`
- `Builder label(String label)`
- `Builder dayValues(List<String> dayValues)`
- `Builder dayValues(String... dayValues)`
- `Builder addDayValue(String dayValue)`
- `ScheduleMetricRow build()`

### SchedulePerson (record)
- `SchedulePerson of(String id, String displayName, int sortOrder)`
- `Builder builder()`
- `Builder id(String id)`
- `Builder displayName(String displayName)`
- `Builder sortOrder(int sortOrder)`
- `SchedulePerson build()`

### ScheduleSlot (record)
- `ScheduleSlot of(String start, String end)`
- `Builder builder()`
- `String displayText()`
- `Builder start(String start)`
- `Builder end(String end)`
- `ScheduleSlot build()`

### WeeklyScheduleData (record)
- `Builder builder()`
- `Builder title(String title)`
- `Builder weekLabel(String weekLabel)`
- `Builder days(List<ScheduleDay> days)`
- `Builder addDay(ScheduleDay day)`
- `Builder day(Consumer<ScheduleDay.Builder> spec)`
- `Builder day(String id, String label, String headerNote, String headerCategoryId)`
- `Builder categories(List<ScheduleCategory> categories)`
- `Builder addCategory(ScheduleCategory category)`
- `Builder category(Consumer<ScheduleCategory.Builder> spec)`
- `Builder category(String id, String label, Color fillColor, Color borderColor)`
- `Builder category(String id, String label, Color fillColor, Color textColor, Color borderColor)`
- `Builder headerMetrics(List<ScheduleMetricRow> headerMetrics)`
- `Builder addHeaderMetric(ScheduleMetricRow headerMetric)`
- `Builder headerMetric(Consumer<ScheduleMetricRow.Builder> spec)`
- `Builder headerMetric(String label, List<String> dayValues)`
- `Builder headerMetric(String label, String... dayValues)`
- `Builder people(List<SchedulePerson> people)`
- `Builder addPerson(SchedulePerson person)`
- `Builder person(Consumer<SchedulePerson.Builder> spec)`
- `Builder person(String id, String displayName, int sortOrder)`
- `Builder assignments(List<ScheduleAssignment> assignments)`
- `Builder addAssignment(ScheduleAssignment assignment)`
- `Builder assignment(Consumer<ScheduleAssignment.Builder> spec)`
- `Builder assignment(String personId, String dayId, String categoryId, ScheduleSlot... slots)`
- `Builder assignment(String personId, String dayId, String categoryId, List<ScheduleSlot> slots, String note)`
- `Builder footerNotes(List<String> footerNotes)`
- `Builder footerNote(String footerNote)`
- `WeeklyScheduleData build()`

### WeeklyScheduleDocumentSpec (record)
- `WeeklyScheduleDocumentSpec from(WeeklyScheduleData schedule)`
- `Builder builder()`
- `Builder title(String title)`
- `Builder weekLabel(String weekLabel)`
- `Builder days(List<ScheduleDay> days)`
- `Builder addDay(ScheduleDay day)`
- `Builder day(Consumer<ScheduleDay.Builder> spec)`
- `Builder day(String id, String label, String headerNote, String headerCategoryId)`
- `Builder categories(List<ScheduleCategory> categories)`
- `Builder addCategory(ScheduleCategory category)`
- `Builder category(Consumer<ScheduleCategory.Builder> spec)`
- `Builder category(String id, String label, Color fillColor, Color borderColor)`
- `Builder category(String id, String label, Color fillColor, Color textColor, Color borderColor)`
- `Builder headerMetrics(List<ScheduleMetricRow> headerMetrics)`
- `Builder addHeaderMetric(ScheduleMetricRow headerMetric)`
- `Builder headerMetric(Consumer<ScheduleMetricRow.Builder> spec)`
- `Builder headerMetric(String label, List<String> dayValues)`
- `Builder headerMetric(String label, String... dayValues)`
- `Builder people(List<SchedulePerson> people)`
- `Builder addPerson(SchedulePerson person)`
- `Builder person(Consumer<SchedulePerson.Builder> spec)`
- `Builder person(String id, String displayName, int sortOrder)`
- `Builder assignments(List<ScheduleAssignment> assignments)`
- `Builder addAssignment(ScheduleAssignment assignment)`
- `Builder assignment(Consumer<ScheduleAssignment.Builder> spec)`
- `Builder assignment(String personId, String dayId, String categoryId, ScheduleSlot... slots)`
- `Builder assignment(String personId, String dayId, String categoryId, List<ScheduleSlot> slots, String note)`
- `Builder footerNotes(List<String> footerNotes)`
- `Builder footerNote(String footerNote)`
- `WeeklyScheduleDocumentSpec build()`


## com.demcha.compose.document.templates.invoice.presets

### ModernInvoice (class)
- `DocumentTemplate<InvoiceDocumentSpec> create()`
- `DocumentTemplate<InvoiceDocumentSpec> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, InvoiceDocumentSpec spec)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`


## com.demcha.compose.document.templates.proposal.presets

### ModernProposal (class)
- `DocumentTemplate<ProposalDocumentSpec> create()`
- `DocumentTemplate<ProposalDocumentSpec> create(BrandTheme theme)`
- `String id()`
- `String displayName()`
- `void compose(DocumentSession document, ProposalDocumentSpec spec)`
- constants: `ID`, `DISPLAY_NAME`, `RECOMMENDED_MARGIN`


## com.demcha.compose.font

### DefaultFonts (class)
- `List<FontFamilyDefinition> bundledFamilies()`
- `List<FontFamilyDefinition> standardFamilies()`
- `List<FontFamilyDefinition> googleFamilies()`
- `List<FontName> bundledFontNames()`

### FontFamilyDefinition (class)
- `FontName name()`
- `String wordFamily()`
- `Optional<Standard14Family> standard14Family()`
- `Optional<FontSourceSet> fontSourceSet()`
- `FontFamilyDefinition standard14(FontName name, String regular, String bold, String italic, String boldItalic)`
- `Builder classpath(FontName name, String regularResource)`
- `Builder classpath(String name, String regularResource)`
- `Builder files(FontName name, Path regularPath)`
- `Builder files(String name, Path regularPath)`
- `Builder wordFamily(String wordFamily)`
- `Builder boldResource(String resourcePath)`
- `Builder italicResource(String resourcePath)`
- `Builder boldItalicResource(String resourcePath)`
- `Builder boldPath(Path path)`
- `Builder italicPath(Path path)`
- `Builder boldItalicPath(Path path)`
- `FontFamilyDefinition build()`
- `InputStream openStream()`
- `String description()`

### FontLibrary (class)
- `<F> Optional<F> getFont(FontName fontName, Class<F> fontClass)`
- `<F> void addFont(FontName name, Class<F> fontClass, F font)`
- `<F> void addFontFactory(FontName name, Class<F> fontClass, Supplier<? extends F> factory)`
- `<F> void addFont(FontName name, F font)`
- `<F> void addFont(FontSet<F> set)`
- `Set<FontName> availableFonts()`

### FontName (class)
- `FontName of(String name)`
- `String name()`
- `String normalizedName()`
- `boolean sameFamily(FontName other)`
- `String toString()`
- `boolean equals(Object o)`
- `int hashCode()`
- constants: `TIMES_ROMAN`, `HELVETICA`, `HELVETICA_BOLD`, `HELVETICA_OBLIQUE`, `HELVETICA_BOLD_OBLIQUE`, `COURIER`, `COURIER_BOLD`, `COURIER_OBLIQUE`, `COURIER_BOLD_OBLIQUE`, `TIMES_BOLD`, `TIMES_ITALIC`, `TIMES_BOLD_ITALIC`, `SYMBOL`, `DEFAULT`, `ZAPF_DINGBATS`, `LATO`, `PT_SANS`, `PT_SERIF`, `FIRA_SANS`, `UBUNTU`, `ALEGREYA_SANS`, `CARLITO`, `POPPINS`, `BARLOW`, `BARLOW_CONDENSED`, `ASAP_CONDENSED`, `ARSENAL`, `IBM_PLEX_SERIF`, `IBM_PLEX_MONO`, `CRIMSON_TEXT`, `SPECTRAL`, `ZILLA_SLAB`, `GENTIUM_PLUS`, `TINOS`, `COUSINE`, `FIRA_SANS_CONDENSED`, `KANIT`, `VOLKHOV`, `TAVIRAJ`, `TRIRONG`, `SARABUN`, `PROMPT`, `ANDIKA`, `BAI_JAMJUREE`, `JETBRAINS_MONO`, `AMIRI`, `DAVID_LIBRE`, `NOTO_SANS_GEORGIAN`, `NOTO_SANS_ARMENIAN`, `GOTHIC_A1`

### FontSet (record)
- `new FontSet(FontName name, F font)`
