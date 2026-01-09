var template = {
    attachments: []
}
var templateId = window.location.pathname.split('/').pop()
if (templateId == "template") {
    templateId = null
}

var icons = {
    "application/vnd.ms-excel": "fa-file-excel-o",
    "text/plain": "fa-file-text-o",
    "image/gif": "fa-file-image-o",
    "image/png": "fa-file-image-o",
    "application/pdf": "fa-file-pdf-o",
    "application/x-zip-compressed": "fa-file-archive-o",
    "application/x-gzip": "fa-file-archive-o",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "fa-file-powerpoint-o",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "fa-file-word-o",
    "application/octet-stream": "fa-file-o",
    "application/x-msdownload": "fa-file-o"
}

function save() {
    var templateData = {
        attachments: []
    }
    templateData.name = $("#name").val()
    var type = $("#template_type").val()
    templateData.type = type

    if (type == "sms") {
        templateData.text = $("#text_template").val()
        templateData.html = ""
        templateData.subject = ""
        templateData.envelope_sender = ""
    } else {
        templateData.subject = $("#subject").val()
        templateData.envelope_sender = $("#envelope-sender").val()
        templateData.html = CKEDITOR.instances["html_editor"].getData();
        templateData.html = templateData.html.replace(/https?:\/\/{{\.URL}}/gi, "{{.URL}}")

        if ($("#use_tracker_checkbox").prop("checked")) {
            if (templateData.html.indexOf("{{.Tracker}}") == -1 &&
                templateData.html.indexOf("{{.TrackingUrl}}") == -1) {
                templateData.html = templateData.html.replace("</body>", "{{.Tracker}}</body>")
            }
        } else {
            templateData.html = templateData.html.replace("{{.Tracker}}</body>", "</body>")
        }
        templateData.text = $("#text_editor").val()
    }

    $.each($("#attachmentsTable").DataTable().rows().data(), function (i, target) {
        templateData.attachments.push({
            name: unescapeHtml(target[1]),
            content: target[3],
            type: target[4],
        })
    })

    var request;
    if (templateId) {
        templateData.id = parseInt(templateId)
        request = api.templateId.put(templateData)
    } else {
        request = api.templates.post(templateData)
    }

    request
        .done(function (data) {
            successFlash("Template saved successfully!")
            setTimeout(function () {
                location.href = "/templates"
            }, 1000)
        })
        .fail(function (data) {
            modalError(data)
        })
}

function attach(files) {
    var attachmentsTable = $("#attachmentsTable").DataTable()
    $.each(files, function (i, file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var icon = icons[file.type] || "fa-file-o"
            attachmentsTable.row.add([
                '<i class="fa ' + icon + '"></i>',
                escapeHtml(file.name),
                '<span class="remove-row"><i class="fa fa-trash-o"></i></span>',
                reader.result.split(",")[1],
                file.type || "application/octet-stream"
            ]).draw()
        }
        reader.readAsDataURL(file)
    })
}

function importEmail() {
    var raw = $("#email_content").val()
    var convert_links = $("#convert_links_checkbox").prop("checked")
    if (!raw) {
        $("#importModal\\.flashes").empty().append("<div class='alert alert-danger'>No Content Specified!</div>")
    } else {
        api.import_email({
            content: raw,
            convert_links: convert_links
        })
            .done(function (data) {
                $("#text_editor").val(data.text)
                CKEDITOR.instances["html_editor"].setData(data.html)
                $("#subject").val(data.subject)
                if (data.html) {
                    CKEDITOR.instances["html_editor"].setMode('wysiwyg')
                    $('.nav-tabs a[href="#html"]').click()
                }
                $("#importEmailModal").modal("hide")
            })
            .fail(function (data) {
                var message = "An error occurred"
                if (data.responseJSON && data.responseJSON.message) {
                    message = data.responseJSON.message
                }
                $("#importModal\\.flashes").empty().append("<div class='alert alert-danger'>" + message + "</div>")
            })
    }
}

$(document).ready(function () {
    $("#html_editor").ckeditor()
    setupAutocomplete(CKEDITOR.instances["html_editor"])

    var attachmentsTable = $('#attachmentsTable').DataTable({
        destroy: true,
        "order": [[1, "asc"]],
        columnDefs: [
            { orderable: false, targets: "no-sort" },
            { sClass: "datatable_hidden", targets: [3, 4] }
        ]
    });

    $("#attachmentsTable").on("click", "span.remove-row", function () {
        attachmentsTable.row($(this).parents('tr')).remove().draw();
    })

    $("#template_type").change(function () {
        var type = $(this).val()
        if (type == "sms") {
            $(".email-only").hide()
            $(".sms-only").show()
            $('.nav-tabs li').removeClass('active')
            $('.tab-pane').removeClass('active')
            $('.nav-tabs li[role="sms"]').addClass('active').show()
            $('#sms').addClass('active')
        } else {
            $(".email-only").show()
            $(".sms-only").hide()
            $('.nav-tabs li').removeClass('active')
            $('.tab-pane').removeClass('active')
            $('.nav-tabs li[role="html"]').addClass('active')
            $('#html').addClass('active')
        }
    })

    $("#saveSubmit").click(save)

    if (templateId) {
        api.templateId.get(templateId)
            .done(function (t) {
                template = t
                $("#templateModalLabel").text("Edit Template: " + template.name)
                $("#name").val(template.name)
                $("#subject").val(template.subject)
                $("#envelope-sender").val(template.envelope_sender)
                CKEDITOR.instances["html_editor"].setData(template.html)
                $("#text_editor").val(template.text)
                $("#text_template").val(template.text)

                var attachmentRows = []
                $.each(template.attachments, function (i, file) {
                    var icon = icons[file.type] || "fa-file-o"
                    attachmentRows.push([
                        '<i class="fa ' + icon + '"></i>',
                        escapeHtml(file.name),
                        '<span class="remove-row"><i class="fa fa-trash-o"></i></span>',
                        file.content,
                        file.type || "application/octet-stream"
                    ])
                })
                attachmentsTable.rows.add(attachmentRows).draw()

                if (template.html && template.html.indexOf("{{.Tracker}}") != -1) {
                    $("#use_tracker_checkbox").prop("checked", true)
                } else {
                    $("#use_tracker_checkbox").prop("checked", false)
                }

                if (template.type) {
                    $("#template_type").val(template.type).trigger("change")
                } else {
                    if ((!template.html || template.html === "") && template.text) {
                        $("#template_type").val("sms").trigger("change")
                    } else {
                        $("#template_type").val("email").trigger("change")
                    }
                }
            })
    } else {
        // Check for Copy parameter
        var urlParams = new URLSearchParams(window.location.search);
        var copyId = urlParams.get('copy');
        if (copyId) {
            api.templateId.get(copyId)
                .done(function (t) {
                    template = t
                    $("#templateModalLabel").text("Copy Template: " + template.name)
                    $("#name").val("Copy of " + template.name)
                    $("#subject").val(template.subject)
                    $("#envelope-sender").val(template.envelope_sender)
                    CKEDITOR.instances["html_editor"].setData(template.html)
                    $("#text_editor").val(template.text)
                    $("#text_template").val(template.text)

                    var attachmentRows = []
                    $.each(template.attachments, function (i, file) {
                        var icon = icons[file.type] || "fa-file-o"
                        attachmentRows.push([
                            '<i class="fa ' + icon + '"></i>',
                            escapeHtml(file.name),
                            '<span class="remove-row"><i class="fa fa-trash-o"></i></span>',
                            file.content,
                            file.type || "application/octet-stream"
                        ])
                    })
                    attachmentsTable.rows.add(attachmentRows).draw()

                    if (template.html && template.html.indexOf("{{.Tracker}}") != -1) {
                        $("#use_tracker_checkbox").prop("checked", true)
                    } else {
                        $("#use_tracker_checkbox").prop("checked", false)
                    }

                    if (template.type) {
                        $("#template_type").val(template.type).trigger("change")
                    } else {
                        $("#template_type").val("email").trigger("change")
                    }
                })
        }
    }

    $('[data-toggle="tooltip"]').tooltip()
})
