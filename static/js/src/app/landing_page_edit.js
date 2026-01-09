/*
    landing_page_edit.js
    Handles the creation and editing of a single landing page
*/

var page = {};

function save() {
    page.name = $("#name").val();
    var editor = CKEDITOR.instances["html_editor"];
    page.html = editor.getData();
    page.capture_credentials = $("#capture_credentials_checkbox").prop("checked");
    page.capture_passwords = $("#capture_passwords_checkbox").prop("checked");
    page.redirect_url = $("#redirect_url_input").val();

    var request;
    if (page.id) {
        request = api.pageId.put(page);
    } else {
        request = api.pages.post(page);
    }

    request
        .done(function (data) {
            Swal.fire({
                title: "Success!",
                text: "Page saved successfully!",
                type: "success"
            }).then(function () {
                location.href = "/landing_pages";
            });
        })
        .fail(function (data) {
            var message = "An error occurred";
            if (data.responseJSON && data.responseJSON.message) {
                message = data.responseJSON.message;
            } else if (data.responseText) {
                message = data.responseText;
            }
            Swal.fire("Error", message, "error");
        });
}

function importSite() {
    var url = $("#url").val();
    if (!url) {
        Swal.fire("Error", "No URL Specified!", "error");
    } else {
        api.clone_site({
            url: url,
            include_resources: false
        })
            .done(function (data) {
                $("#html_editor").val(data.html);
                CKEDITOR.instances["html_editor"].setData(data.html);
                $("#importSiteModal").modal("hide");
            })
            .fail(function (data) {
                var message = "An error occurred";
                if (data.responseJSON && data.responseJSON.message) {
                    message = data.responseJSON.message;
                }
                Swal.fire("Error", message, "error");
            });
    }
}

$(document).ready(function () {
    $("#html_editor").ckeditor();
    // Use the autocomplete plugin
    if (typeof setupAutocomplete === "function") {
        setupAutocomplete(CKEDITOR.instances["html_editor"]);
    }

    $("#capture_credentials_checkbox").change(function () {
        $("#capture_passwords").toggle();
        $("#redirect_url").toggle();
    });

    $("#submitButton").click(save);
    $("#importSubmitButton").click(importSite);

    // Check if we are editing an existing page or copying one
    var path = window.location.pathname;
    var id = path.split('/').pop();

    // Function to get query params
    var getUrlParameter = function getUrlParameter(sParam) {
        var sPageURL = window.location.search.substring(1),
            sURLVariables = sPageURL.split('&'),
            sParameterName,
            i;

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
        $("#pageTitle").text("Edit Landing Page");
        api.pageId.get(id)
            .done(function (p) {
                page = p;
                $("#name").val(page.name);
                $("#html_editor").val(page.html);
                CKEDITOR.instances["html_editor"].setData(page.html);
                $("#capture_credentials_checkbox").prop("checked", page.capture_credentials).change();
                $("#capture_passwords_checkbox").prop("checked", page.capture_passwords);
                $("#redirect_url_input").val(page.redirect_url);
            })
            .fail(function () {
                Swal.fire("Error", "Error fetching page data", "error");
            });
    } else if (copyId) {
        $("#pageTitle").text("Copy Landing Page");
        api.pageId.get(copyId)
            .done(function (p) {
                // Don't set page.id so it saves as new
                $("#name").val("Copy of " + p.name);
                $("#html_editor").val(p.html);
                CKEDITOR.instances["html_editor"].setData(p.html);
                $("#capture_credentials_checkbox").prop("checked", p.capture_credentials).change();
                $("#capture_passwords_checkbox").prop("checked", p.capture_passwords);
                $("#redirect_url_input").val(p.redirect_url);
            })
            .fail(function () {
                Swal.fire("Error", "Error fetching page data for copy", "error");
            });
    }
});
