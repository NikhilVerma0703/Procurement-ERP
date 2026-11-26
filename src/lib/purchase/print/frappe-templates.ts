// Frappe's "Standard" print, as the old site ran it (docs/15, X3, 26-11-2026): the Jinja templates of
// Frappe 14.101.1 (frappe/templates/print_formats/standard.html and standard_macros.html, MIT) and the
// item / tax / total includes of ERPNext 14.92.14 (erpnext/templates/print_formats/includes/*.html,
// GPL-3.0), read from their tagged sources on GitHub. They run on print/jinja.ts unchanged but for two
// things nunjucks cannot read: Python's list slice `rows[start:end]`, written with the `pyslice` filter, and
// trailing commas — those of resolve_class's two dictionaries left out, the one-item tuple ("Check",) written
// as the list ["Check"].

export const FRAPPE_TEMPLATES: Record<string, string> = {
  "templates/print_formats/standard.html": `{%- from "templates/print_formats/standard_macros.html" import add_header, render_field with context -%}

{% for page in layout %}
<div class="page-break">
	<div {% if print_settings.repeat_header_footer %} id="header-html" class="hidden-pdf" {% endif %}>
		{{ add_header(loop.index, layout|len, doc, letter_head, no_letterhead, footer, print_settings, print_heading_template) }}
	</div>

	{% for section in page %}
	<div class="row section-break" data-label="{{ section.label or '' | e }}">
		{%- if doc.print_line_breaks and loop.index != 1 -%}<hr>{%- endif -%}
		{%- if doc.print_section_headings and section.label and section.has_data -%}
		<h4 class='col-sm-12'>{{ _(section.label) }}</h4>
		{%- endif -%}
		{%- set no_of_cols = section.columns|len -%}
		{% for column in section.columns %}
			<div class="col-xs-{{ (12 / no_of_cols)|int }} column-break">
			{% for df in column.fields %}
				{{ render_field(df, doc, no_of_cols) }}
			{% endfor %}
			</div>
		{% endfor %}
	</div>
	{% endfor %}

	<div {% if print_settings.repeat_header_footer %} id="footer-html" class="visible-pdf" {% endif %}>
		{% if not no_letterhead and footer %}
		<div class="letter-head-footer">
			{{ footer }}
		</div>
		{% endif %}
		{% if print_settings.repeat_header_footer %}
			<p class="text-center small page-number visible-pdf">
				{{ _("Page {0} of {1}").format('<span class="page"></span>', '<span class="topage"></span>') }}
			</p>
		{% endif %}
	</div>
</div>
{% endfor %}
`,

  "templates/print_formats/standard_macros.html": `{% macro render_field(df, doc, no_of_cols=2) -%}
	{%- if df.fieldtype=="Table" -%}
		{{ render_table(df, doc) }}
	{%- elif df.fieldtype=="HTML" and df.options -%}
		<div>{{ frappe.render_template(df.options, {"doc": doc}) or "" }}</div>
	{%- elif df.fieldtype in ("Text", "Text Editor", "Code", "Long Text") -%}
		{{ render_text_field(df, doc) }}
	{%- elif df.fieldtype in ("Image", "Attach Image")
		and (
			(guess_mimetype(doc[df.fieldname])[0] or "").startswith("image/")
			or doc[df.fieldname].startswith("http")
		) -%}
		{{ render_image(df, doc) }}
	{%- elif df.fieldtype=="Geolocation" -%}
		{{ render_geolocation(df, doc) }}
	{%- elif df.fieldtype=="Signature" -%}
		{{ render_signature(df, doc) }}
	{%- elif df.fieldtype=="Currency" -%}
		{%- if doc.print_templates and
				doc.print_templates.get(df.fieldname) -%}
			{% include doc.print_templates[df.fieldname] %}
		{%- else -%}
			{{ render_field_with_label(df, doc, no_of_cols) }}
		{%- endif -%}
	{%- else -%}
		{{ render_field_with_label(df, doc, no_of_cols) }}
	{%- endif -%}
{%- endmacro -%}

{%- macro render_table(df, doc) -%}
	{%- set table_meta = frappe.get_meta(df.options) -%}
	{%- set data = doc.get(df.fieldname) | pyslice(df.start, df.end) -%}
	{%- if doc.print_templates and
			doc.print_templates.get(df.fieldname) -%}
		{% include doc.print_templates[df.fieldname] %}
	{%- else -%}
		{%- if data -%}
		{%- set visible_columns = get_visible_columns(doc.get(df.fieldname),
			table_meta, df) -%}
		<div {{ fieldmeta(df) }}>
			<table class="table table-bordered table-condensed">
				<thead>
					<tr>
						<th style="width: 40px" class="table-sr">{{ _("Sr") }}</th>
						{% for tdf in visible_columns %}
						<th style="width: {{ get_width(tdf) }};" class="{{ get_align_class(tdf) }}" {{ fieldmeta(df) }}>
							{{ _(tdf.label) }}</th>
						{% endfor %}
					</tr>
				</thead>
				<tbody>
					{% for d in data %}
					<tr>
						<td class="table-sr">{{ d.idx }}</td>
						{% for tdf in visible_columns %}
							<td class="{{ get_align_class(tdf) }}" {{ fieldmeta(df) }}>
							{% if doc.child_print_templates %}
								{%- set child_templates = doc.child_print_templates.get(df.fieldname) -%}
								<div class="value">{{ _(print_value(tdf, d, doc, visible_columns, child_templates)) }}</div></td>
							{% else %}
								<div class="value">{{ _(print_value(tdf, d, doc, visible_columns)) }}</div></td>
							{% endif %}
						{% endfor %}
					</tr>
					{% endfor %}
				</tbody>
			</table>
		</div>
		{%- endif -%}
	{%- endif -%}
{%- endmacro -%}

{% macro fieldmeta(df) -%}
data-fieldname="{{ df.fieldname }}" data-fieldtype="{{ df.fieldtype }}"
{%- endmacro %}

{%- macro render_field_with_label(df, doc, no_of_cols) -%}
		{%- set label_col_class = resolve_class({
			'col-xs-9': df.fieldtype=="Check",
			'col-xs-5': df.fieldtype!="Check" and no_of_cols < 3,
			'col-xs-12': df.fieldtype!="Check" and no_of_cols >= 3
		}) -%}

		{%- set value_col_class = resolve_class({
			'col-xs-3': df.fieldtype=="Check",
			'col-xs-7': df.fieldtype!="Check" and no_of_cols < 3,
			'col-xs-12': df.fieldtype!="Check" and no_of_cols >= 3
		}) -%}

		{% set render_field = doc.get(df.fieldname) != 0 if df.fieldtype == "Check" else doc.get(df.fieldname) != None %}
		{% if render_field %}
			<div class="row {% if df.bold %}important{% endif %} data-field" {{ fieldmeta(df) }}>
				<div class="{{label_col_class}}
					{%- if doc.align_labels_right %} text-right{%- endif -%}">
					{% if df.fieldtype not in ("Image", "HTML") %}
					<label>{{ _(df.label) }}: </label>
					{% endif %}
				</div>
				<div class="{{value_col_class}}
				{{ get_align_class(df, no_of_cols) }} value">
					{{ _(print_value(df, doc)) }}
				</div>
			</div>
		{% endif %}
{%- endmacro -%}

{%- macro render_text_field(df, doc) -%}
{%- if doc.get(df.fieldname) != None -%}
<div style="padding: 10px 0px" {{ fieldmeta(df) }}>
	{%- if df.fieldtype in ("Text", "Code", "Long Text") %}<label>{{ _(df.label) }}</label>{%- endif %}
	{%- if df.fieldtype=="Code" %}
		<pre class="value">{{ doc.get(df.fieldname)|e }}</pre>
	{% else -%}
		{{ doc.get_formatted(df.fieldname, parent_doc or doc, translated=df.translatable) }}
{% endif -%}
</div>
{%- endif -%}
{%- endmacro -%}

{%- macro render_image(df, doc) -%}
	{{ print_value(df, doc) }}
{% endmacro %}

{%- macro render_signature(df, doc) -%}
	{{ print_value(df, doc) }}
{% endmacro %}

{%- macro render_geolocation(df, doc) -%}
	{{ "" }}
{%- endmacro -%}

{%- macro print_value(df, doc, parent_doc=None, visible_columns=None, child_templates=None) -%}
	{% if child_templates and child_templates[df.fieldname] %}
		{% include child_templates[df.fieldname] %}
	{% elif df.fieldtype=="Check" and doc[df.fieldname] %}
		<!-- <i class="{{ 'fa fa-check' }}"></i> -->
		<svg viewBox="0 0 16 16"
			fill="transparent" stroke="#1F272E" stroke-width="2"
			xmlns="http://www.w3.org/2000/svg" id="icon-tick"
			style="width: 12px; height: 12px; margin-top: 5px;">
			<path d="M2 9.66667L5.33333 13L14 3" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	{% elif df.fieldtype=="Check" and not doc[df.fieldname] %}
		<!-- empty -->
	{% elif df.fieldtype in ("Image", "Attach Image") and frappe.utils.is_image(doc[doc.meta.get_field(df.fieldname).options]) %}
		<img src="{{ doc[doc.meta.get_field(df.fieldname).options] }}"
			class="img-responsive"
			{%- if df.print_width %} style="width: {{ get_width(df) }};"{% endif %}>
	{% elif df.fieldtype=="Attach Image" %}
		<img src="{{ doc[df.fieldname] }}"
			class="img-responsive"
			{%- if df.print_width %} style="width: {{ get_width(df) }};"{% endif %}>
	{% elif df.fieldtype=="Signature" %}
		<img src="{{ doc[df.fieldname] }}" class="signature-img img-responsive"
			{%- if df.print_width %} style="width: {{ get_width(df) }};"{% endif %}>
	{% elif df.fieldtype in ("Attach", "Attach Image") %}
		<img src="{{ doc[df.fieldname] }}" class="img-responsive"
			{%- if df.print_width %} style="width: {{ get_width(df) }};"{% endif %}>
	{% elif df.fieldtype=="HTML" %}
		{{ frappe.render_template(df.options, {"doc":doc}) }}
	{% elif df.fieldtype=="Currency" %}
		{{ doc.get_formatted(df.fieldname, parent_doc or doc, translated=df.translatable) }}
	{% else %}
		{%- set parent = parent_doc or doc -%}
		{{ doc.get_formatted(df.fieldname, parent, translated=df.translatable, absolute_value=parent.absolute_value) }}
	{% endif %}
{%- endmacro %}

{% macro get_width(df) -%}
	{%- if df.print_width -%}
		{%- if df.print_width.endswith("%") -%}
			{{ df.print_width }}
		{%- else -%}
			{{ df.print_width.replace("px", "") }}px
		{%- endif -%}
	{%- elif df.fieldtype in ("Int", "Check", "Float", "Currency") -%}{{ 80 }}px
	{%- else -%}{{ 150 }}px{% endif -%}
{%- endmacro %}

{% macro get_align_class(df, no_of_cols=2) %}
	{% if no_of_cols >= 3 %}{{ "" }}
	{%- elif df.align -%}{{ "text-" + df.align }}
	{%- elif df.fieldtype in ("Int", "Float", "Currency", "Percent") -%}{{ "text-right" }}
	{%- elif df.fieldtype in ["Check"] -%}{{ "text-center" }}
	{%- else -%}{{ "" }}
	{%- endif -%}
{% endmacro %}

{%- macro add_header(page_num, max_pages, doc, letter_head, no_letterhead, footer, print_settings=None, print_heading_template=None) -%}
	{% if letter_head and not no_letterhead %}
		<div class="letter-head">{{ letter_head }}</div>
	{% endif %}
	{% if print_heading_template %}
		{{ frappe.render_template(print_heading_template, {"doc":doc}) }}
	{% else %}
	<div class="print-heading">
		<h2>
			<div>{{ _(doc.select_print_heading) or (_(doc.print_heading) if doc.print_heading != None
				else _(doc.doctype)) }}</div>
			<small class="sub-heading">{{ _(doc.sub_heading) if doc.sub_heading != None
				else doc.name }}</small>
		</h2>
	</div>
	{% endif %}
	{%- if doc.meta.is_submittable and doc.docstatus==0 and (print_settings==None or print_settings.add_draft_heading) -%}
	<div class="text-center" document-status="draft">
		<h4 style="margin: 0px;">{{ _("DRAFT") }}</h4>
	</div>
	{%- endif -%}
	{%- if doc.meta.is_submittable and doc.docstatus==2-%}
	<div class="text-center" document-status="cancelled">
		<h4 style="margin: 0px;">{{ _("CANCELLED") }}</h4>
	</div>
	{%- endif -%}
{%- endmacro -%}
`,

  "templates/print_formats/includes/items.html": `{%- if data -%}
	{%- set visible_columns = get_visible_columns(doc.get(df.fieldname),
		table_meta, df) -%}
	<div {{ fieldmeta(df) }}>
		<table class="table table-bordered table-condensed">
			<thead>
				<tr>
					<th style="width: 40px" class="table-sr">{{ _("Sr") }}</th>
					{% for tdf in visible_columns %}
					{% if (data and not print_settings.compact_item_print) or tdf.fieldname in doc.flags.compact_item_fields %}
						<th style="width: {{ get_width(tdf) }};" class="{{ get_align_class(tdf) }}" {{ fieldmeta(df) }}>
							{{ _(tdf.label) }}</th>
					{% endif %}
					{% endfor %}
				</tr>
			</thead>
			<tbody>
				{% for d in data %}
				<tr>
					<td class="table-sr">{{ d.idx }}</td>
					{% for tdf in visible_columns %}
					{% if not print_settings.compact_item_print or tdf.fieldname in doc.flags.compact_item_fields %}
						<td class="{{ get_align_class(tdf) }}" {{ fieldmeta(df) }}>
						{% if doc.child_print_templates %}
							{%- set child_templates = doc.child_print_templates.get(df.fieldname) %}
							<div class="value">{{ print_value(tdf, d, doc, visible_columns, child_templates) }}</div></td>
						{% else %}
							<div class="value">{{ print_value(tdf, d, doc, visible_columns) }}</div></td>
						{% endif %}
					{% endif %}
					{% endfor %}
				</tr>
				{% endfor %}
			</tbody>
		</table>
	</div>
{%- endif -%}
`,

  "templates/print_formats/includes/item_table_qty.html": `{% set qty_first=print_settings.print_uom_after_quantity %}
{% if qty_first %}
	{{ doc.get_formatted("qty", doc) }}
	{% if (doc.uom and not doc.is_print_hide("uom")) %} {{ _(doc.uom) }}
	{% elif (doc.stock_uom and not doc.is_print_hide("stock_uom")) %} {{ _(doc.stock_uom) }}
	{%- endif %}
{% else %}
	{% if (doc.uom and not doc.is_print_hide("uom")) %}
		<small class="pull-left">{{ _(doc.uom) }}</small>
	{% elif (doc.stock_uom and not doc.is_print_hide("stock_uom")) %}
		<small class="pull-left">{{ _(doc.stock_uom) }}</small>
	{%- endif %}
	{{ doc.get_formatted("qty", doc) }}
{%- endif %}
`,

  "templates/print_formats/includes/item_table_description.html": `{%- set compact = print_settings.compact_item_print -%}
{%- set compact_fields = parent_doc.flags.compact_item_fields -%}
{%- set display_columns = visible_columns|map(attribute="fieldname")| list -%}
{%- set columns = parent_doc.flags.format_columns(display_columns, compact_fields) -%}

{% if doc.in_format_data("image") and doc.get("image") and "image" in display_columns -%}
<div class="pull-left" style="max-width: 40%; margin-right: 10px;">
	<img class="print-item-image" src="{{ doc.image }}" alt="">
</div>
{%- endif %}

<div>
	{% if doc.in_format_data("item_code") and "item_code" in display_columns -%}
		{% if compact %}
		<div class="primary compact-item">
			{{ _(doc.item_code) }}
		</div>
		{% endif %}
	{%- endif %}

	{%- if doc.in_format_data("item_name") and "item_name" in display_columns and
		not (doc.in_format_data("item_code") and doc.item_code == doc.item_name) -%}
		<div class="primary">{{ doc.get_formatted("item_name", translated=True) }}</div>
	{%- endif %}

	{% if (doc.in_format_data("description") and doc.description and
		(
			(
				(not doc.in_format_data("item_code") or doc.is_print_hide("item_code")) and
				(not doc.in_format_data("item_name") or doc.is_print_hide("item_name"))
			) or not (doc.item_code == doc.item_name == doc.description)
		))
	-%}
	<p>{{ doc.get_formatted("description", translated=True) }}</p>
	{%- endif %}

	{% if compact -%}
		{%- for fieldname in columns -%}
			{% if doc.get(fieldname) and doc.in_format_data(fieldname) -%}
			<p>
				<strong>{{ _(doc.meta.get_label(fieldname)) }}:</strong>
				{{ doc.get_formatted(fieldname, translated=True)  }}
			</p>
			{% endif %}
		{%- endfor -%}
	{%- endif %}
</div>
`,

  "templates/print_formats/includes/taxes.html": `{%- macro render_discount_amount(doc) -%}
	{%- if doc.discount_amount -%}
		<div class="row">
			<div class="col-xs-5 {%- if doc.align_labels_right %} text-right{%- endif -%}">
				<label>{{ _(doc.meta.get_label('discount_amount')) }}</label></div>
			<div class="col-xs-7 text-right">
				- {{ doc.get_formatted("discount_amount", doc) }}
			</div>
		</div>
	{%- endif -%}
{%- endmacro -%}

<div class="row">
	<div class="col-xs-6"></div>
	<div class="col-xs-6">
		{%- if doc.apply_discount_on == "Net Total" -%}
			{{ render_discount_amount(doc) }}
		{%- endif -%}
		{%- for charge in data -%}
			{%- if (charge.tax_amount or print_settings.print_taxes_with_zero_amount) and (not charge.included_in_print_rate or doc.flags.show_inclusive_tax_in_print) -%}
			<div class="row">
				<div class="col-xs-5 {%- if doc.align_labels_right %} text-right{%- endif -%}">
					<label>{{ charge.get_formatted("description") }}</label>
				</div>
				<div class="col-xs-7 text-right">
					{{ charge.get_formatted('tax_amount', doc) }}
				</div>
			</div>
			{%- endif -%}
		{%- endfor -%}
		{%- if doc.apply_discount_on == "Grand Total" -%}
			{{ render_discount_amount(doc) }}
		{%- endif -%}
	</div>
</div>
`,

  "templates/print_formats/includes/total.html": `<div class="row {% if df.bold %}important{% endif %} data-field">
	{% if doc.flags.show_inclusive_tax_in_print %}
		<div class="col-xs-5 {%- if doc.align_labels_right %} text-right{%- endif -%}">
			<label>{{ _("Total (Without Tax)") }}</label></div>
		<div class="col-xs-7 text-right value">
			{{ doc.get_formatted("net_total", doc) }}
		</div>
	{% else %}
		<div class="col-xs-5 {%- if doc.align_labels_right %} text-right{%- endif -%}">
			<label>{{ _(df.label) }}</label></div>
		<div class="col-xs-7 text-right value">
			{{ doc.get_formatted("total", doc) }}
		</div>
	{% endif %}
</div>
`,
};
