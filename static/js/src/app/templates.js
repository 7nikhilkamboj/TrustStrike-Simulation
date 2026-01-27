var templates = []
var templateType = "" // Default to email

// Switch template type view
function switchTemplateType(type) {
    templateType = type

    if (type == "") {
        pageHeader = "All Templates"
        $(".page-header").text(pageHeader)
    } else if (type == "email") {
        pageHeader = "Email Templates"
        $(".page-header").text(pageHeader)
    } else if (type == "sms") {
        pageHeader = "SMS Templates"
        $(".page-header").text(pageHeader)
    } else if (type == "qr") {
        pageHeader = "QR Templates"
        $(".page-header").text(pageHeader)
    }
    $("#emptyMessageText").text("No " + templateType + " templates created yet. Let's create one!")
    load()
}

function edit(idx) {
    if (idx == -1) {
        location.href = "/template"
    } else {
        location.href = "/template/" + templates[idx].id
    }
}

function copy(idx) {
    location.href = "/template?copy=" + templates[idx].id
}


function deleteTemplate(idx) {
    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the template. This can't be undone!",
        type: "warning",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Delete " + escapeHtml(templates[idx].name),
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                api.templateId.delete(templates[idx].id)
                    .done(function (msg) {
                        resolve(msg)
                    })
                    .fail(function (data) {
                        var message = "An error occurred"
                        if (data.responseJSON && data.responseJSON.message) {
                            message = data.responseJSON.message
                        } else if (data.responseText) {
                            message = data.responseText
                        }
                        Swal.showValidationMessage(message)
                        resolve(false)
                    })
            })
        }
    }).then(function (result) {
        if (result.value) {
            Swal.fire(
                'Template Deleted!',
                'This template has been deleted!',
                'success'
            );
        }
        $('button:contains("OK")').on('click', function () {
            location.reload()
        })
    })
}

function load() {
    $("#templateTable").hide()
    $("#emptyMessage").hide()
    $("#loading").show()
    var labelClass = "label-default"
    api.templates.get()
        .done(function (ts) {
            templates = ts
            // Filter based on templateType
            if (templateType == "") {
                labelClass = "label-primary"
            } else if (templateType == "sms") {
                templates = templates.filter(t => t.type == "sms")
                labelClass = "label-primary"
            } else if (templateType == "qr") {
                templates = templates.filter(t => t.type == "qr")
                labelClass = "label-info"
            } else {
                // Email: Default to email if type is email OR undefined/null (legacy)
                templates = templates.filter(t => !t.type || t.type == "email")
                labelClass = "label-primary"
            }
            $("#loading").hide()
            if (templates.length > 0) {
                $("#templateTable").show()
                templateTable = $("#templateTable").DataTable({
                    destroy: true,
                    columnDefs: [{
                        orderable: false,
                        targets: "no-sort"
                    }]
                });

                templateTable.clear()
                templateRows = []
                $.each(templates, function (i, template) {

                    // Define color specific to THIS template
                    var rowClass = "label-default";
                    var type = template.type || "email"; // Handle legacy data

                    if (type == "qr") {
                        rowClass = "label label-primary"; // Green (as requested)
                    } else if (type == "email") {
                        rowClass = "label-success"; // Yellow (as requested)
                    } else if (type == "sms") {
                        rowClass = "label-info";    // Blue
                    }

                    templateRows.push([
                        (window.modifySystem === "true" ? "<input type='checkbox' class='template-checkbox' value='" + template.id + "'>" : ""),
                        escapeHtml(template.name), "<span class='label " + rowClass + "'>" + (template.type || "EMAIL").toUpperCase() + "</span>",
                        escapeHtml(template.created_by || ""),
                        moment(template.modified_date).format('MMMM Do YYYY, h:mm:ss a'),
                        "<div class='pull-right'>" + (window.modifySystem === "true" ? "<button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Edit Template' onclick='edit(" + i + ")'>\
                    <i class='fa fa-pencil'></i>\
                    </button>\
		    <button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Copy Template' onclick='copy(" + i + ")'>\
                    <i class='fa fa-copy'></i>\
                    </button>\
                    <button class='btn btn-danger' data-toggle='tooltip' data-placement='left' title='Delete Template' onclick='deleteTemplate(" + i + ")'>\
                    <i class='fa fa-trash-o'></i>\
                    </button>" : "") + "</div>"
                    ])
                })
                templateTable.rows.add(templateRows).draw()
                $('[data-toggle="tooltip"]').tooltip()
            } else {
                $("#emptyMessage").show()
            }
        })
        .fail(function () {
            $("#loading").hide()
            errorFlash("Error fetching templates")
        })
}

$(document).ready(function () {
    // Determine template type from URL if necessary, else default to email
    switchTemplateType("")

    if (window.location.pathname.indexOf("sms") !== -1) {
        templateType = "sms";
    } else if (window.location.pathname.indexOf("qr") !== -1) {
        templateType = "qr";

    }
    // Set active button
    $("#type_" + templateType).parent().addClass("active")
})

/* --- Bulk Management --- */

function toggleSelectAll() {
    var checked = $("#selectAllTemplates").is(":checked");
    $(".template-checkbox").prop("checked", checked);
}

function bulkDeleteSelected() {
    var ids = [];
    $(".template-checkbox:checked").each(function () {
        ids.push($(this).val());
    });

    if (ids.length === 0) {
        Swal.fire("No selection", "Please select at least one template to delete.", "info");
        return;
    }

    Swal.fire({
        title: "Delete " + ids.length + " templates?",
        text: "This action cannot be undone!",
        type: "warning",
        showCancelButton: true,
        confirmButtonText: "Delete",
        confirmButtonColor: "#d9534f",
        reverseButtons: true
    }).then(function (result) {
        if (result.value) {
            Swal.fire({
                title: 'Deleting...',
                allowOutsideClick: false,
                onBeforeOpen: () => {
                    Swal.showLoading();
                }
            });

            var promises = ids.map(id => api.templateId.delete(id));
            $.when.apply($, promises).then(function () {
                Swal.fire('Deleted!', 'The selected templates have been removed.', 'success').then(() => {
                    location.reload();
                });
            }).fail(function () {
                Swal.fire('Error', 'Some templates could not be deleted.', 'error').then(() => {
                    location.reload();
                });
            });
        }
    });
}
