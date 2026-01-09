function errorFlash(message) {
    $("#flashes").empty()
    $("#flashes").append("<div style=\"text-align:center\" class=\"alert alert-danger\">\
        <i class=\"fa fa-exclamation-circle\"></i> " + message + "</div>")
}

function successFlash(message) {
    $("#flashes").empty()
    $("#flashes").append("<div style=\"text-align:center\" class=\"alert alert-success\">\
        <i class=\"fa fa-check-circle\"></i> " + message + "</div>")
}

// Fade message after n seconds
function errorFlashFade(message, fade) {
    $("#flashes").empty()
    $("#flashes").append("<div style=\"text-align:center\" class=\"alert alert-danger\">\
        <i class=\"fa fa-exclamation-circle\"></i> " + message + "</div>")
    setTimeout(function () {
        $("#flashes").empty()
    }, fade * 1000);
}
// Fade message after n seconds
function successFlashFade(message, fade) {
    $("#flashes").empty()
    $("#flashes").append("<div style=\"text-align:center\" class=\"alert alert-success\">\
        <i class=\"fa fa-check-circle\"></i> " + message + "</div>")
    setTimeout(function () {
        $("#flashes").empty()
    }, fade * 1000);

}

function modalError(data) {
    var message = "An error occurred"
    if (typeof data === 'string') {
        message = data
    } else if (data && data.responseJSON && data.responseJSON.message) {
        message = data.responseJSON.message
    } else if (data && data.responseText) {
        message = data.responseText
    }
    // Using SweetAlert2 for error messages
    Swal.fire({
        title: 'Error',
        text: message,
        icon: 'error',
        confirmButtonText: 'OK',
        buttonsStyling: false,
        confirmButtonClass: 'btn btn-danger',
        customClass: {
            confirmButton: 'btn btn-danger'
        }
    });
}

function query(endpoint, method, data, async) {
    return $.ajax({
        url: "/api" + endpoint,
        async: async,
        method: method,
        data: JSON.stringify(data),
        dataType: "json",
        contentType: "application/json",
        beforeSend: function (xhr) {
            // Include CSRF token if available
            if (typeof csrf_token !== 'undefined') {
                xhr.setRequestHeader('X-CSRF-Token', csrf_token);
            }
            // Authentication is handled via HttpOnly JWT cookies sent automatically by the browser.
        }
    })
}

function escapeHtml(text) {
    return $("<div/>").text(text).html()
}
window.escapeHtml = escapeHtml

function unescapeHtml(html) {
    return $("<div/>").html(html).text()
}

/**
 * 
 * @param {string} string - The input string to capitalize
 * 
 */
var capitalize = function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/*
Define our API Endpoints
*/
var api = {
    // campaigns contains the endpoints for /campaigns
    campaigns: {
        // get() - Queries the API for GET /campaigns
        get: function (params) {
            params = params || ""
            return query("/campaigns/" + params, "GET", {}, false)
        },
        // post() - Posts a campaign to POST /campaigns
        post: function (data) {
            return query("/campaigns/", "POST", data, false)
        },
        // summary() - Queries the API for GET /campaigns/summary
        summary: function (params) {
            params = params || ""
            return query("/campaigns/summary" + params, "GET", {}, false)
        }
    },
    // sms_campaigns contains the endpoints for /sms_campaigns
    sms_campaigns: {
        // get() - Queries the API for GET /sms_campaigns
        get: function (params) {
            params = params || ""
            return query("/sms_campaigns/" + params, "GET", {}, false)
        },
        // post() - Posts a campaign to POST /sms_campaigns
        post: function (data) {
            return query("/sms_campaigns/", "POST", data, false)
        }
    },
    // campaignId contains the endpoints for /campaigns/:id
    campaignId: {
        // get() - Queries the API for GET /campaigns/:id
        get: function (id) {
            return query("/campaigns/" + id, "GET", {}, true)
        },
        // delete() - Deletes a campaign at DELETE /campaigns/:id
        delete: function (id) {
            return query("/campaigns/" + id, "DELETE", {}, false)
        },
        // results() - Queries the API for GET /campaigns/:id/results
        results: function (id) {
            return query("/campaigns/" + id + "/results", "GET", {}, true)
        },
        // complete() - Completes a campaign at POST /campaigns/:id/complete
        complete: function (id) {
            return query("/campaigns/" + id + "/complete", "GET", {}, true)
        },
        // summary() - Queries the API for GET /campaigns/summary
        summary: function (id) {
            return query("/campaigns/" + id + "/summary", "GET", {}, true)
        }
    },
    // groups contains the endpoints for /groups
    groups: {
        // get() - Queries the API for GET /groups
        get: function () {
            return query("/groups/", "GET", {}, false)
        },
        // post() - Posts a group to POST /groups
        post: function (group) {
            return query("/groups/", "POST", group, false)
        },
        // summary() - Queries the API for GET /groups/summary
        summary: function () {
            return query("/groups/summary", "GET", {}, true)
        },
        // bulk_import_confirm() - Confirms a bulk import
        bulk_import_confirm: function (req) {
            return query("/import/group/bulk_confirm", "POST", req, false).done(function () {
                pollActiveJobs(); // Restart poller on success
            })
        }
    },
    // groupId contains the endpoints for /groups/:id
    groupId: {
        // get() - Queries the API for GET /groups/:id
        get: function (id) {
            return query("/groups/" + id, "GET", {}, false)
        },
        // put() - Puts a group to PUT /groups/:id
        put: function (group) {
            return query("/groups/" + group.id, "PUT", group, false)
        },
        // delete() - Deletes a group at DELETE /groups/:id
        delete: function (id) {
            return query("/groups/" + id, "DELETE", {}, false)
        }
    },
    // templates contains the endpoints for /templates
    templates: {
        // get() - Queries the API for GET /templates
        get: function () {
            return query("/templates/", "GET", {}, false)
        },
        // post() - Posts a template to POST /templates
        post: function (template) {
            return query("/templates/", "POST", template, false)
        }
    },
    // templateId contains the endpoints for /templates/:id
    templateId: {
        // get() - Queries the API for GET /templates/:id
        get: function (id) {
            return query("/templates/" + id, "GET", {}, false)
        },
        // put() - Puts a template to PUT /templates/:id
        put: function (template) {
            return query("/templates/" + template.id, "PUT", template, false)
        },
        // delete() - Deletes a template at DELETE /templates/:id
        delete: function (id) {
            return query("/templates/" + id, "DELETE", {}, false)
        }
    },
    // pages contains the endpoints for /pages
    pages: {
        // get() - Queries the API for GET /pages
        get: function () {
            return query("/pages/", "GET", {}, false)
        },
        // post() - Posts a page to POST /pages
        post: function (page) {
            return query("/pages/", "POST", page, false)
        }
    },
    // pageId contains the endpoints for /pages/:id
    pageId: {
        // get() - Queries the API for GET /pages/:id
        get: function (id) {
            return query("/pages/" + id, "GET", {}, false)
        },
        // put() - Puts a page to PUT /pages/:id
        put: function (page) {
            return query("/pages/" + page.id, "PUT", page, false)
        },
        // delete() - Deletes a page at DELETE /pages/:id
        delete: function (id) {
            return query("/pages/" + id, "DELETE", {}, false)
        }
    },
    // SMTP contains the endpoints for /smtp
    SMTP: {
        // get() - Queries the API for GET /smtp
        get: function () {
            return query("/smtp/", "GET", {}, false)
        },
        // post() - Posts a SMTP to POST /smtp
        post: function (smtp) {
            return query("/smtp/", "POST", smtp, false)
        }
    },
    // SMTPId contains the endpoints for /smtp/:id
    SMTPId: {
        // get() - Queries the API for GET /smtp/:id
        get: function (id) {
            return query("/smtp/" + id, "GET", {}, false)
        },
        // put() - Puts a SMTP to PUT /smtp/:id
        put: function (smtp) {
            return query("/smtp/" + smtp.id, "PUT", smtp, false)
        },
        // delete() - Deletes a SMTP at DELETE /smtp/:id
        delete: function (id) {
            return query("/smtp/" + id, "DELETE", {}, false)
        }
    },
    // SMS contains the endpoints for /sms
    SMS: {
        // get() - Queries the API for GET /sms
        get: function () {
            return query("/sms/", "GET", {}, false)
        },
        // post() - Posts a SMS to POST /sms
        post: function (sms) {
            return query("/sms/", "POST", sms, false)
        }
    },
    // SMSId contains the endpoints for /sms/:id
    SMSId: {
        // get() - Queries the API for GET /sms/:id
        get: function (id) {
            return query("/sms/" + id, "GET", {}, false)
        },
        // put() - Puts a SMS to PUT /sms/:id
        put: function (sms) {
            return query("/sms/" + sms.id, "PUT", sms, false)
        },
        // delete() - Deletes a SMS at DELETE /sms/:id
        delete: function (id) {
            return query("/sms/" + id, "DELETE", {}, false)
        }
    },
    // IMAP containts the endpoints for /imap/
    IMAP: {
        get: function () {
            return query("/imap/", "GET", {}, !1)
        },
        post: function (e) {
            return query("/imap/", "POST", e, !1)
        },
        validate: function (e) {
            return query("/imap/validate", "POST", e, true)
        }
    },
    // users contains the endpoints for /users
    users: {
        // get() - Queries the API for GET /users
        get: function () {
            return query("/users/", "GET", {}, true)
        },
        // post() - Posts a user to POST /users
        post: function (user) {
            return query("/users/", "POST", user, true)
        }
    },
    // userId contains the endpoints for /users/:id
    userId: {
        // get() - Queries the API for GET /users/:id
        get: function (id) {
            return query("/users/" + id, "GET", {}, true)
        },
        // put() - Puts a user to PUT /users/:id
        put: function (user) {
            return query("/users/" + user.id, "PUT", user, true)
        },
        // delete() - Deletes a user at DELETE /users/:id
        delete: function (id) {
            return query("/users/" + id, "DELETE", {}, true)
        }
    },
    // userGroups contains the endpoints for /user_groups/
    userGroups: {
        get: function () {
            return query("/user_groups/", "GET", {}, true)
        },
        post: function (group) {
            return query("/user_groups/", "POST", group, true)
        }
    },
    // userGroupId contains the endpoints for /user_groups/:id
    userGroupId: {
        get: function (id) {
            return query("/user_groups/" + id, "GET", {}, true)
        },
        delete: function (id) {
            return query("/user_groups/" + id, "DELETE", {}, true)
        },
        addMember: function (id, userId) {
            return query("/user_groups/" + id + "/members", "POST", { user_id: parseInt(userId) }, true)
        },
        removeMember: function (id, userId) {
            return query("/user_groups/" + id + "/members/" + userId, "DELETE", {}, true)
        }
    },
    webhooks: {
        get: function () {
            return query("/webhooks/", "GET", {}, false)
        },
        post: function (webhook) {
            return query("/webhooks/", "POST", webhook, false)
        },
    },
    webhookId: {
        get: function (id) {
            return query("/webhooks/" + id, "GET", {}, false)
        },
        put: function (webhook) {
            return query("/webhooks/" + webhook.id, "PUT", webhook, true)
        },
        delete: function (id) {
            return query("/webhooks/" + id, "DELETE", {}, false)
        },
        ping: function (id) {
            return query("/webhooks/" + id + "/validate", "POST", {}, true)
        },
    },
    // import handles all of the "import" functions in the api
    import_email: function (req) {
        return query("/import/email", "POST", req, false).done(function () {
            pollActiveJobs(); // Restart poller on success
        })
    },
    // clone_site handles importing a site by url
    clone_site: function (req) {
        return query("/import/site", "POST", req, false).done(function () {
            pollActiveJobs(); // Restart poller on success
        })
    },
    // send_test_email sends an email to the specified email address
    send_test_email: function (req) {
        return query("/util/send_test_email", "POST", req, true)
    },
    // send_test_sms sends an sms to the specified phone number
    send_test_sms: function (req) {
        return query("/util/send_test_sms", "POST", req, true)
    },
    reset: function () {
        return query("/reset", "POST", {}, true)
    }
}
window.api = api

// Global Progress Polling for Background Jobs
var jobPollInterval = null;
function pollActiveJobs() {
    $.ajax({
        url: "/api/import/jobs/active",
        method: "GET",
        success: function (jobs) {
            if (jobs && jobs.length > 0) {
                var job = jobs[0];
                var processed = parseInt(job.processed) || 0;
                var total = parseInt(job.total) || 0;
                var percent = 0;
                if (total > 0) {
                    percent = Math.round((processed / total) * 100);
                }

                $("#global-job-processed").text(processed.toLocaleString());
                $("#global-job-total").text(total > 0 ? total.toLocaleString() : "?");
                $("#global-job-percent").text(percent + "%");
                $("#global-job-bar").css("width", percent + "%");
                $("#global-progress-container").show();
                $("#view-import-details").data("job-id", job.id);

                // Start intermittent polling if not already running
                if (!jobPollInterval) {
                    resetJobPolling(2000);
                }
            } else {
                $("#global-progress-container").hide();
                // Stop polling if nothing is active
                if (jobPollInterval) {
                    console.log("No active jobs. Stopping background poller.");
                    clearInterval(jobPollInterval);
                    jobPollInterval = null;
                }
            }
        },
        error: function (xhr) {
            if (xhr.status === 401) {
                console.warn("Active job polling: Unauthorized. Stopping poll.");
                if (jobPollInterval) {
                    clearInterval(jobPollInterval);
                    jobPollInterval = null;
                }
            }
        }
    });
}

function resetJobPolling(interval) {
    if (jobPollInterval) {
        clearInterval(jobPollInterval);
    }
    jobPollInterval = setInterval(pollActiveJobs, interval);
}

function viewJobDetails(jobId) {
    if (typeof pollJob === 'function') {
        pollJob(jobId);
    } else {
        Swal.fire({
            title: 'Import Progress',
            html: '<div style="margin-bottom:10px;">Progress: <span id="job-percent" style="font-weight:bold; font-size:1.2em;">0%</span></div>' +
                '<div class="progress" style="margin-bottom:15px; height: 20px;">' +
                '  <div id="job-bar" class="progress-bar progress-bar-striped active" role="progressbar" style="width: 0%"></div>' +
                '</div>' +
                '<div style="margin-bottom:10px;">' +
                '  Processed: <span id="job-processed">0</span> / <span id="job-total">0</span><br>' +
                '  Status: <span id="job-status">Processing</span>' +
                '</div>',
            allowOutsideClick: false,
            showConfirmButton: true,
            confirmButtonText: 'Run in Background',
            showCancelButton: true,
            cancelButtonText: 'Cancel Import',
            cancelButtonColor: '#d33'
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.cancel) {
                $.ajax({
                    url: "/api/import/job/" + jobId + "/cancel",
                    type: "POST",
                    success: function () {
                        successFlash("Import cancellation requested");
                        $("#global-progress-container").hide();
                        // If we are on the groups page, reload to clear any "pending" rows
                        if (location.pathname === "/groups") {
                            setTimeout(function () {
                                if (typeof load === 'function') { load(); }
                                else { location.reload(); }
                            }, 1000);
                        }
                    }
                });
            }
        });

        var interval = setInterval(function () {
            if (!Swal.isVisible()) {
                clearInterval(interval);
                return;
            }
            $.get("/api/import/job/" + jobId, function (job) {
                var processed = parseInt(job.processed) || 0;
                var total = parseInt(job.total) || 0;
                var percent = 0;
                if (total > 0) {
                    percent = Math.round((processed / total) * 100);
                }
                $("#job-processed").text(processed.toLocaleString());
                $("#job-total").text(total > 0 ? total.toLocaleString() : "?");
                $("#job-status").text(job.status);
                $("#job-percent").text(percent + "%");
                $("#job-bar").css("width", percent + "%");

                if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
                    clearInterval(interval);
                    Swal.fire({
                        title: 'Import ' + (job.status.charAt(0).toUpperCase() + job.status.slice(1)),
                        text: job.result || (job.errors ? job.errors.join("\n") : ""),
                        icon: job.status === 'completed' ? 'success' : (job.status === 'cancelled' ? 'warning' : 'error')
                    }).then(() => {
                        // Reload if on groups page
                        if (location.pathname === "/groups") {
                            if (typeof load === 'function') { load(); }
                            else { location.reload(); }
                        }
                    });
                }
            });
        }, 1000);
    }
}

// Register our moment.js datatables listeners
$(document).ready(function () {
    // Setup nav highlighting
    var path = location.pathname;
    $('.nav-sidebar li').each(function () {
        var $this = $(this);
        // if the current path is like this link, make it active
        if ($this.find("a").attr('href') === path) {
            $this.addClass('active');
        }
    })
    $.fn.dataTable.moment('MMMM Do YYYY, h:mm:ss a');
    // Setup tooltips
    $('[data-toggle="tooltip"]').tooltip()

    // Background Progress Logic
    pollActiveJobs(); // Only starts interval if jobs are active

    $("#view-import-details").click(function () {
        var jobId = $(this).data("job-id");
        if (jobId) {
            viewJobDetails(jobId);
        }
    });
});