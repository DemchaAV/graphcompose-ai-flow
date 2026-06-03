// Renderable adapter for the table-basic skill fixture (see RowBasicFixtureDocument
// for why this exists). Compose logic mirrors TableBasicFixtureTest.
package com.demcha.compose.document.fixtures.tablebasic;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;
import com.demcha.compose.document.theme.BusinessTheme;

public final class TableBasicFixtureDocument {

    public void compose(DocumentSession document) {
        BusinessTheme theme = BusinessTheme.modern();
        document.pageFlow(page -> page
                .name("TableBasicFixture")
                .spacing(8)
                .addTable(table -> renderLineItems(table, theme)));
    }

    private static void renderLineItems(TableBuilder table, BusinessTheme theme) {
        DocumentTableStyle bordered = DocumentTableStyle.builder()
                .stroke(DocumentStroke.of(theme.palette().rule(), 0.6))
                .padding(DocumentInsets.of(7.0))
                .build();
        DocumentTableStyle headerStyle = DocumentTableStyle.builder()
                .fillColor(theme.palette().primary())
                .stroke(DocumentStroke.of(theme.palette().rule(), 0.6))
                .padding(DocumentInsets.of(8.0))
                .textStyle(theme.text().label())
                .build();

        table.name("LineItems")
                .columns(
                        DocumentTableColumn.auto(),
                        DocumentTableColumn.fixed(54),
                        DocumentTableColumn.fixed(96))
                .defaultCellStyle(bordered)
                .headerRow("Description", "Qty", "Amount")
                .headerStyle(headerStyle)
                .zebra(theme.palette().surfaceMuted(), theme.palette().surface())
                .row("Design discovery", "4", "$ 1,200.00")
                .row("Implementation", "8", "$ 2,400.00");
    }
}
