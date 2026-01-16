var profiles = []
var profileType = ""


function switchProfileType(type) {
    profileType = type
    if (type == "") {
        pageHeader = "All Sending Profiles"
        $(".page-header").text(pageHeader)
    } else if (type == "email") {
        pageHeader = "SMTP Profiles"
        $(".page-header").text(pageHeader)
    } else if (type == "sms") {
        pageHeader = "SMS Profiles"
        $(".page-header").text(pageHeader)
    }
    $("#emptyMessageText").text("No " + profileType + " profiles created yet. Let's create one!")
    load()
}

// Attempts to send a test email by POSTing to /campaigns/
function sendTestEmail() {
    var headers = [];
    $.each($("#headersTable").DataTable().rows().data(), function (i, header) {
        headers.push({
            key: unescapeHtml(header[0]),
            value: unescapeHtml(header[1]),
        })
    })
    var test_email_request = {
        template: {},
        first_name: $("input[name=to_first_name]").val(),
        last_name: $("input[name=to_last_name]").val(),
        email: $("input[name=to_email]").val(),
        position: $("input[name=to_position]").val(),
        url: '',
        smtp: {
            from_address: $("#from").val(),
            host: $("#host").val(),
            username: $("#username").val(),
            password: $("#password").val(),
            ignore_cert_errors: $("#ignore_cert_errors").prop("checked"),
            headers: headers,
        }
    }
    btnHtml = $("#sendTestModalSubmit").html()
    $("#sendTestModalSubmit").html('<i class="fa fa-spinner fa-spin"></i> Sending')
    // Send the test email
    api.send_test_email(test_email_request)
        .done(function (data) {
            $("#sendTestEmailModal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-success\">\
	    <i class=\"fa fa-check-circle\"></i> Email Sent!</div>")
            $("#sendTestModalSubmit").html(btnHtml)
        })
        .fail(function (data) {
            var message = "An error occurred"
            if (data.responseJSON && data.responseJSON.message) {
                message = data.responseJSON.message
            } else if (data.responseText) {
                message = data.responseText
            }
            $("#sendTestEmailModal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-danger\">\
	    <i class=\"fa fa-exclamation-circle\"></i> " + escapeHtml(message) + "</div>")
            $("#sendTestModalSubmit").html(btnHtml)
        })
}

// Save attempts to POST to /smtp/ or /sms/
function save(idx) {
    var profile = {
        headers: []
    }
    profile.name = $("#name").val()
    profile.name = $("#name").val()
    profile.interface_type = $("#interface_type").val()
    if (idx != -1) {
        profile.interface_type = profiles[idx].interface_type
    }

    if (profile.interface_type == "SMTP") {
        $.each($("#headersTable").DataTable().rows().data(), function (i, header) {
            profile.headers.push({
                key: unescapeHtml(header[0]),
                value: unescapeHtml(header[1]),
            })
        })
        profile.from_address = $("#from").val()
        profile.host = $("#host").val()
        profile.username = $("#username").val()
        profile.password = $("#password").val()
        profile.ignore_cert_errors = $("#ignore_cert_errors").prop("checked")
    } else {
        profile.account_sid = $("#account_sid").val()
        profile.auth_token = $("#auth_token").val()
        profile.sms_from = $("#sms_from").val()
    }

    if (idx != -1) {
        profile.id = profiles[idx].id
        var p;
        if (profile.interface_type == "SMTP") {
            p = api.SMTPId.put(profile)
        } else {
            p = api.SMSId.put(profile)
        }
        p.done(function (data) {
            successFlash("Profile edited successfully!")
            load()
            dismiss()
        })
            .fail(function (data) {
                modalError(data)
            })
    } else {
        var p;
        if (profile.interface_type == "SMTP") {
            p = api.SMTP.post(profile)
        } else {
            p = api.SMS.post(profile)
        }
        p.done(function (data) {
            successFlash("Profile added successfully!")
            load()
            dismiss()
        })
            .fail(function (data) {
                modalError(data.responseJSON.message)
            })
    }
}

function dismiss() {
    $("#modal\\.flashes").empty()
    $("#name").val("")
    $("#modal\\.flashes").empty()
    $("#name").val("")
    $("#interface_type").val("SMTP")
    $("#from").val("")
    $("#from").val("")
    $("#host").val("")
    $("#username").val("")
    $("#password").val("")
    $("#ignore_cert_errors").prop("checked", true)
    $("#account_sid").val("")
    $("#auth_token").val("")
    $("#sms_from").val("")
    $("#smtp_fields").show()
    $("#sms_fields").hide()
    $("#smtp_headers_section").show()
    $("#headersTable").dataTable().DataTable().clear().draw()
    $("#modal").modal('hide')
}

var dismissSendTestEmailModal = function () {
    $("#sendTestEmailModal\\.flashes").empty()
    $("#sendTestModalSubmit").html("<i class='fa fa-envelope'></i> Send")
}

var deleteProfile = function (idx) {
    var profile = profiles[idx]
    Swal.fire({
        title: "Are you sure?",
        text: "This will delete the sending profile. This can't be undone!",
        type: "warning",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Delete " + escapeHtml(profile.name),
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                var p;
                if (profile.interface_type == "SMTP") {
                    p = api.SMTPId.delete(profile.id)
                } else {
                    p = api.SMSId.delete(profile.id)
                }
                p.done(function (msg) {
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
                'Sending Profile Deleted!',
                'This sending profile has been deleted!',
                'success'
            );
        }
        $('button:contains("OK")').on('click', function () {
            location.reload()
        })
    })
}

function edit(idx) {
    if (idx == -1) {
        location.href = "/sending_profile";
    } else {
        location.href = "/sending_profile/" + profiles[idx].id;
    }
}

function copy(idx) {
    location.href = "/sending_profile?copy=" + profiles[idx].id;
}

function load() {
    $("#profileTable").hide()
    $("#emptyMessage").hide()
    $("#loading").show()
    var p1 = api.SMTP.get()
    var p2 = api.SMS.get()
    $.when(p1, p2).done(function (r1, r2) {
        profiles = r1[0].concat(r2[0])
        // Filter based on page title
        if (profileType == "email") {
            profiles = profiles.filter(p => !p.interface_type || p.interface_type == "SMTP")
        } else if (profileType == "sms") {
            profiles = profiles.filter(p => p.interface_type == "SMS")
        }
        $("#loading").hide()
        if (profiles.length > 0) {
            $("#profileTable").show()
            profileTable = $("#profileTable").DataTable({
                destroy: true,
                autoWidth: false,
                columnDefs: [{
                    orderable: false,
                    targets: "no-sort"
                }]
            });
            profileTable.clear()
            profileRows = []
            $.each(profiles, function (i, profile) {

                if (profile.interface_type == "SMTP") {
                    rowClass = "label-success";
                } else if (profile.interface_type == "SMS") {
                    rowClass = "label-info";
                }

                profileRows.push([
                    "<input type='checkbox' class='profile-checkbox' value='" + profile.id + "' data-type='" + profile.interface_type + "'>",
                    escapeHtml(profile.name),
                    "<span class='label " + rowClass + "'>" + (profile.interface_type || "EMAIL").toUpperCase() + "</span>",
                    escapeHtml(profile.created_by || ""),
                    moment(profile.modified_date).format('MMMM Do YYYY, h:mm:ss a'),
                    "<div style='white-space: nowrap;'><button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Edit Profile' style='margin-right: 4px;' onclick='edit(" + i + ")'>\
                    <i class='fa fa-pencil'></i>\
                    </button>\
                    <button class='btn btn-primary' data-toggle='tooltip' data-placement='left' title='Copy Profile' style='margin-right: 4px;' onclick='copy(" + i + ")'>\
                    <i class='fa fa-copy'></i>\
                    </button>\
                    <button class='btn btn-danger' data-toggle='tooltip' data-placement='left' title='Delete Profile' onclick='deleteProfile(" + i + ")'>\
                    <i class='fa fa-trash-o'></i>\
                    </button></div>"
                ])
            })
            profileTable.rows.add(profileRows).draw()
            $('[data-toggle="tooltip"]').tooltip()
        } else {
            $("#emptyMessage").show()
        }
    })
        .fail(function () {
            $("#loading").hide()
            errorFlash("Error fetching profiles")
        })
}

function addCustomHeader(header, value) {
    // Create new data row.
    var newRow = [
        escapeHtml(header),
        escapeHtml(value),
        '<span style="cursor:pointer;"><i class="fa fa-trash-o"></i></span>'
    ];

    // Check table to see if header already exists.
    var headersTable = headers.DataTable();
    var existingRowIndex = headersTable
        .column(0) // Email column has index of 2
        .data()
        .indexOf(escapeHtml(header));

    // Update or add new row as necessary.
    if (existingRowIndex >= 0) {
        headersTable
            .row(existingRowIndex, {
                order: "index"
            })
            .data(newRow);
    } else {
        headersTable.row.add(newRow);
    }
    headersTable.draw();
}

$(document).ready(function () {
    switchProfileType("")
    // Setup multiple modals
    // Code based on http://miles-by-motorcycle.com/static/bootstrap-modal/index.html
    $('.modal').on('hidden.bs.modal', function (event) {
        $(this).removeClass('fv-modal-stack');
        $('body').data('fv_open_modals', $('body').data('fv_open_modals') - 1);
    });
    $('.modal').on('shown.bs.modal', function (event) {
        // Keep track of the number of open modals
        if (typeof ($('body').data('fv_open_modals')) == 'undefined') {
            $('body').data('fv_open_modals', 0);
        }
        // if the z-index of this modal has been set, ignore.
        if ($(this).hasClass('fv-modal-stack')) {
            return;
        }
        $(this).addClass('fv-modal-stack');
        // Increment the number of open modals
        $('body').data('fv_open_modals', $('body').data('fv_open_modals') + 1);
        // Setup the appropriate z-index
        $(this).css('z-index', 1040 + (10 * $('body').data('fv_open_modals')));
        $('.modal-backdrop').not('.fv-modal-stack').css('z-index', 1039 + (10 * $('body').data('fv_open_modals')));
        $('.modal-backdrop').not('fv-modal-stack').addClass('fv-modal-stack');
    });
    $.fn.modal.Constructor.prototype.enforceFocus = function () {
        $(document)
            .off('focusin.bs.modal') // guard against infinite focus loop
            .on('focusin.bs.modal', $.proxy(function (e) {
                if (
                    this.$element[0] !== e.target && !this.$element.has(e.target).length
                    // CKEditor compatibility fix start.
                    &&
                    !$(e.target).closest('.cke_dialog, .cke').length
                    // CKEditor compatibility fix end.
                ) {
                    this.$element.trigger('focus');
                }
            }, this));
    };
    // Scrollbar fix - https://stackoverflow.com/questions/19305821/multiple-modals-overlay
    $(document).on('hidden.bs.modal', '.modal', function () {
        $('.modal:visible').length && $(document.body).addClass('modal-open');
    });
    $('#modal').on('hidden.bs.modal', function (event) {
        dismiss()
    });
    $('#modal').on('hidden.bs.modal', function (event) {
        dismiss()
    });
    $("#interface_type").on('change', function () {
        if ($(this).val() == "SMTP") {
            $("#smtp_fields").show()
            $("#sms_fields").hide()
            $("#smtp_headers_section").show()
        } else {
            $("#smtp_fields").hide()
            $("#sms_fields").show()
            $("#smtp_headers_section").hide()
        }
    }).trigger('change')
    $("#sendTestEmailModal").on("hidden.bs.modal", function (event) {
        dismissSendTestEmailModal()
    })
    // Code to deal with custom email headers
    $("#addCustomHeader").on('click', function () {
        headerKey = $("#headerKey").val();
        headerValue = $("#headerValue").val();

        if (headerKey == "" || headerValue == "") {
            return false;
        }
        addCustomHeader(headerKey, headerValue);
        // Reset user input.
        $("#headerKey").val('');
        $("#headerValue").val('');
        $("#headerKey").focus();
        return false;
    });
    // Handle Deletion
    $("#headersTable").on("click", "span>i.fa-trash-o", function () {
        headers.DataTable()
            .row($(this).parents('tr'))
            .remove()
            .draw();
    });
    load()
})

/* --- Bulk Management --- */

function toggleSelectAll() {
    var checked = $("#selectAllProfiles").is(":checked");
    $(".profile-checkbox").prop("checked", checked);
}

function bulkDeleteSelected() {
    var selected = [];
    $(".profile-checkbox:checked").each(function () {
        selected.push({
            id: $(this).val(),
            type: $(this).data("type")
        });
    });

    if (selected.length === 0) {
        Swal.fire("No selection", "Please select at least one profile to delete.", "info");
        return;
    }

    Swal.fire({
        title: "Delete " + selected.length + " profiles?",
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

            var promises = selected.map(p => {
                if (p.type == "SMTP") {
                    return api.SMTPId.delete(p.id);
                } else {
                    return api.SMSId.delete(p.id);
                }
            });

            $.when.apply($, promises).then(function () {
                Swal.fire('Deleted!', 'The selected profiles have been removed.', 'success').then(() => {
                    location.reload();
                });
            }).fail(function () {
                Swal.fire('Error', 'Some profiles could not be deleted.', 'error').then(() => {
                    location.reload();
                });
            });
        }
    });
}
