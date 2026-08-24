// Renderable adapter for the table-basic skill fixture (see RowBasicFixtureDocument
// for why this exists). Compose logic mirrors TableBasicFixtureTest.
package com.demcha.compose.document.fixtures.tablebasic;

import com.demcha.compose.document.api.DocumentSession;
import com.demcha.compose.document.dsl.TableBuilder;
import com.demcha.compose.document.style.DocumentInsets;
import com.demcha.compose.document.style.DocumentStroke;
import com.demcha.compose.document.table.DocumentTableColumn;
import com.demcha.compose.document.table.DocumentTableStyle;

public final class TableBasicFixtureDocument {

    public void compose(DocumentSession document) {
        
        document.pageFlow(page -> page
                .name("TableBasicFixture")
                .spacing(8)
                .addTable(table -> renderLineItems(table)));
    }

    private static void renderLineItems(TableBuilder table) {
        DocumentTableStyle bordered = DocumentTableStyle.builder()
                .stroke(DocumentStroke.of(FixtureTheme.RULE, 0.6))
                .padding(DocumentInsets.of(7.0))
                .build();
        DocumentTableStyle headerStyle = DocumentTableStyle.builder()
                .fillColor(FixtureTheme.PRIMARY)
                .stroke(DocumentStroke.of(FixtureTheme.RULE, 0.6))
                .padding(DocumentInsets.of(8.0))
                .textStyle(FixtureTheme.LABEL)
                .build();

        table.name("LineItems")
                .columns(
                        DocumentTableColumn.auto(),
                        DocumentTableColumn.fixed(54),
                        DocumentTableColumn.fixed(96))
                .defaultCellStyle(bordered)
                .headerRow("Description", "Qty", "Amount")
                .headerStyle(headerStyle)
                .zebra(FixtureTheme.SURFACE_MUTED, FixtureTheme.SURFACE)
                .row("Design discovery", "4", "$ 1,200.00")
                .row("Implementation", "8", "$ 2,400.00");
    }
}
