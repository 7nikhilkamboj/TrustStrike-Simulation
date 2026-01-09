/*
    sending_profile_edit.js
    Handles the creation and editing of a single sending profile
*/

var profile = {
    headers: []
};
var headersTable;

function addCustomHeader(header, value) {
    var newRow = [
        escapeHtml(header),
        escapeHtml(value),
        '<span style="cursor:pointer;" class="delete-header"><i class="fa fa-trash-o"></i></span>'
    ];

    var existingRowIndex = headersTable
        .column(0)
        .data()
        .indexOf(escapeHtml(header));

    if (existingRowIndex >= 0) {
        headersTable.row(existingRowIndex).data(newRow);
    } else {
        headersTable.row.add(newRow);
    }
    headersTable.draw();
}

function save() {
    profile.name = $("#name").val();
    profile.interface_type = $("#interface_type").val();

    if (profile.interface_type == "SMTP") {
        profile.headers = [];
        $.each(headersTable.rows().data(), function (i, header) {
            profile.headers.push({
                key: unescapeHtml(header[0]),
                value: unescapeHtml(header[1]),
            });
        });
        profile.from_address = $("#from").val();
        profile.host = $("#host").val();
        profile.username = $("#username").val();
        profile.password = $("#password").val();
        profile.ignore_cert_errors = $("#ignore_cert_errors").prop("checked");
    } else {
        profile.account_sid = $("#account_sid").val();
        profile.auth_token = $("#auth_token").val();
        profile.sms_from = $("#sms_from").val();
    }

    var request;
    if (profile.id) {
        request = (profile.interface_type == "SMTP") ? api.SMTPId.put(profile) : api.SMSId.put(profile);
    } else {
        request = (profile.interface_type == "SMTP") ? api.SMTP.post(profile) : api.SMS.post(profile);
    }

    request.done(function (data) {
        Swal.fire({
            title: "Success!",
            text: "Profile saved successfully!",
            type: "success"
        }).then(function () {
            location.href = "/sending_profiles";
        });
    }).fail(function (data) {
        var message = "An error occurred";
        if (data.responseJSON && data.responseJSON.message) {
            message = data.responseJSON.message;
        }
        Swal.fire("Error", message, "error");
    });
}

function sendTestEmail() {
    var headers = [];
    $.each(headersTable.rows().data(), function (i, header) {
        headers.push({
            key: unescapeHtml(header[0]),
            value: unescapeHtml(header[1]),
        });
    });

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
    };

    var btn = $("#confirmSendTest");
    var btnHtml = btn.html();
    btn.html('<i class="fa fa-spinner fa-spin"></i> Sending').prop('disabled', true);

    api.send_test_email(test_email_request)
        .done(function (data) {
            $("#testEmailFlashes").empty().append('<div class="alert alert-success"><i class="fa fa-check-circle"></i> Email Sent!</div>');
            btn.html(btnHtml).prop('disabled', false);
        })
        .fail(function (data) {
            var message = "An error occurred";
            if (data.responseJSON && data.responseJSON.message) {
                message = data.responseJSON.message;
            }
            $("#testEmailFlashes").empty().append('<div class="alert alert-danger"><i class="fa fa-exclamation-circle"></i> ' + escapeHtml(message) + '</div>');
            btn.html(btnHtml).prop('disabled', false);
        });
}

$(document).ready(function () {
    headersTable = $("#headersTable").DataTable({
        destroy: true,
        paging: false,
        searching: false,
        info: false,
        columnDefs: [{
            orderable: false,
            targets: "no-sort"
        }]
    });

    $("#interface_type").change(function () {
        if ($(this).val() == "SMTP") {
            $("#smtp_fields").show();
            $("#sms_fields").hide();
            $("#sendTestButton").show();
        } else {
            $("#smtp_fields").hide();
            $("#sms_fields").show();
            $("#sendTestButton").hide();
        }
    }).trigger('change');

    $("#addCustomHeader").click(function () {
        var key = $("#headerKey").val();
        var val = $("#headerValue").val();
        if (key && val) {
            addCustomHeader(key, val);
            $("#headerKey").val('').focus();
            $("#headerValue").val('');
        }
    });

    $("#headersTable").on("click", ".delete-header", function () {
        headersTable.row($(this).parents('tr')).remove().draw();
    });

    $("#submitButton").click(save);
    $("#sendTestButton").click(function () {
        $("#testEmailFlashes").empty();
        $("#sendTestEmailModal").modal('show');
    });
    $("#confirmSendTest").click(sendTestEmail);

    var path = window.location.pathname;
    var id = path.split('/').pop();

    var getUrlParameter = function getUrlParameter(sParam) {
        var sPageURL = window.location.search.substring(1),
            sURLVariables = sPageURL.split('&'),
            sParameterName, i;
        for (i = 0; i < sURLVariables.length; i++) {
            sParameterName = sURLVariables[i].split('=');
            if (sParameterName[0] === sParam) {
                return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1]);
            }
        }
        return false;
    };

    var copyId = getUrlParameter('copy');

    if (id && !isNaN(id)) {
        $("#pageTitle").text("Edit Sending Profile");
        // We need to check both SMTP and SMS APIs
        api.SMTPId.get(id)
            .done(function (p) {
                loadProfile(p);
            })
            .fail(function () {
                api.SMSId.get(id)
                    .done(function (p) {
                        loadProfile(p);
                    })
                    .fail(function () {
                        Swal.fire("Error", "Error fetching profile data", "error");
                    });
            });
    } else if (copyId) {
        $("#pageTitle").text("Copy Sending Profile");
        api.SMTPId.get(copyId)
            .done(function (p) {
                loadProfile(p, true);
            })
            .fail(function () {
                api.SMSId.get(copyId)
                    .done(function (p) {
                        loadProfile(p, true);
                    })
                    .fail(function () {
                        Swal.fire("Error", "Error fetching profile data for copy", "error");
                    });
            });
    }

    function loadProfile(p, isCopy) {
        profile = p;
        if (isCopy) {
            delete profile.id;
            $("#name").val("Copy of " + p.name);
        } else {
            $("#name").val(p.name);
        }

        $("#interface_type").val(p.interface_type || "SMTP").trigger('change');
        if (p.interface_type == "SMTP" || !p.interface_type) {
            $("#from").val(p.from_address);
            $("#host").val(p.host);
            $("#username").val(p.username);
            $("#password").val(p.password);
            $("#ignore_cert_errors").prop("checked", p.ignore_cert_errors);
            $.each(p.headers, function (i, h) {
                addCustomHeader(h.key, h.value);
            });
        } else {
            $("#account_sid").val(p.account_sid);
            $("#auth_token").val(p.auth_token);
            $("#sms_from").val(p.sms_from);
        }
    }
});
