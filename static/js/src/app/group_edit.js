var group = {}
var groupId = window.location.pathname.split('/').pop()
if (groupId == "group" || groupId == "new" || isNaN(parseInt(groupId))) {
    groupId = null
}

function save() {
    // Check for bulk token in data attribute
    var bulkFileToken = $("#saveSubmit").data("bulk-token");

    // If we have a bulk file token, we use the bulk confirm endpoint
    if (bulkFileToken) {
        var group = {};
        group.name = $("#name").val();
        if (!group.name) {
            modalError("Group name is required");
            return;
        }
        if (groupId) {
            group.group_id = parseInt(groupId);
        }
        group.file_token = bulkFileToken;
        group.group_type = $("#group_type").val();

        api.groups.bulk_import_confirm(group)
            .done(function (data) {
                if (data.success && data.job_id) {
                    pollJob(data.job_id, data.group_id);
                } else {
                    modalError(data.message || "Failed to start import");
                }
            })
            .fail(function (xhr) {
                var msg = "Server error";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    msg = xhr.responseJSON.message;
                }
                modalError(msg);
            });
        return;
    }

    // Standard Save Flow
    var targets = []
    $.each($("#targetsTable").DataTable().rows().data(), function (i, target) {
        targets.push({
            first_name: unescapeHtml(target[0]),
            last_name: unescapeHtml(target[1]),
            email: unescapeHtml(target[2]),
            position: unescapeHtml(target[3])
        })
    })
    var groupData = {
        name: $("#name").val(),
        group_type: $("#group_type").val(),
        targets: targets
    }

    var request;
    if (groupId) {
        groupData.id = parseInt(groupId)
        request = api.groupId.put(groupData)
    } else {
        request = api.groups.post(groupData)
    }

    request
        .done(function (data) {
            successFlash("Group saved successfully!")
            setTimeout(function () {
                location.href = "/groups"
            }, 1000)
        })
        .fail(function (data) {
            modalError(data)
        })
}

function addTarget(firstNameInput, lastNameInput, emailInput, positionInput) {
    // Create new data row.
    var email = escapeHtml(emailInput).toLowerCase();
    var newRow = [
        escapeHtml(firstNameInput),
        escapeHtml(lastNameInput),
        email,
        escapeHtml(positionInput),
        '<span style="cursor:pointer;"><i class="fa fa-trash-o"></i></span>'
    ];

    // Check table to see if email already exists.
    var targetsTable = $("#targetsTable").DataTable();
    var existingRowIndex = targetsTable
        .column(2, {
            order: "index"
        }) // Email column has index of 2
        .data()
        .indexOf(email);
    // Update or add new row as necessary.
    if (existingRowIndex >= 0) {
        targetsTable
            .row(existingRowIndex, {
                order: "index"
            })
            .data(newRow);
    } else {
        targetsTable.row.add(newRow);
    }
}

var downloadCSVTemplate = function () {
    var csvScope = [{
        'First Name': 'Example',
        'Last Name': 'User',
        'Email': 'foobar@example.com',
        'Position': 'Systems Administrator'
    }]
    var filename = 'group_template.csv'
    var csvString = Papa.unparse(csvScope, {})
    var csvData = new Blob([csvString], {
        type: 'text/csv;charset=utf-8;'
    });
    if (navigator.msSaveBlob) {
        navigator.msSaveBlob(csvData, filename);
    } else {
        var csvURL = window.URL.createObjectURL(csvData);
        var dlLink = document.createElement('a');
        dlLink.href = csvURL;
        dlLink.setAttribute('download', filename)
        document.body.appendChild(dlLink)
        dlLink.click();
        document.body.removeChild(dlLink)
    }
}

function pollJob(jobId, completedGroupId) {
    Swal.fire({
        title: 'Importing Targets',
        html: '<div style="margin-bottom:10px;">Progress: <span id="job-percent" style="font-weight:bold; font-size:1.2em;">0%</span></div>' +
            '<div class="progress" style="margin-bottom:15px; height: 20px;">' +
            '  <div id="job-bar" class="progress-bar progress-bar-striped active" role="progressbar" style="width: 0%"></div>' +
            '</div>' +
            '<div style="margin-bottom:10px;">' +
            '  Processed: <span id="job-processed">0</span> / <span id="job-total">?</span><br>' +
            '  Status: <span id="job-status">Pending</span>' +
            '</div>',
        allowOutsideClick: false,
        showConfirmButton: true,
        confirmButtonText: '<i class="fa fa-external-link"></i> Run in Background',
        confirmButtonColor: '#3085d6',
        showCancelButton: true,
        cancelButtonText: '<i class="fa fa-stop"></i> Cancel Import',
        cancelButtonColor: '#d33'
    }).then((result) => {
        if (result.value) {
            // Run in background - navigate to groups
            window.location.href = "/groups";
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            // Cancel import
            $.ajax({
                url: "/api/import/job/" + jobId + "/cancel",
                type: "POST",
                success: function () {
                    successFlash("Import cancellation requested");
                },
                error: function () {
                    errorFlash("Failed to cancel import");
                }
            });
        }
    });

    var interval = setInterval(function () {
        $.get("/api/import/job/" + jobId, function (job) {
            // If the Swal is closed, stop polling unless it was "Run in Background"
            if (!Swal.isVisible() && window.location.pathname.indexOf("/group") !== -1) {
                // Check if it was closed via code (completion/failure) or user
                // If user closed it via buttons, the .then() block handles it.
                // If it just disappeared, we stop to be safe.
                // However, we want to allow it to stay active if user navigated away.
                // Since this page will be destroyed on navigation, clearInterval is fine.
            }

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

            if (job.status === "completed") {
                clearInterval(interval);
                if (Swal.isVisible()) {
                    Swal.fire({
                        title: 'Import Complete',
                        text: job.result,
                        type: 'success'
                    }).then(() => {
                        window.location.href = "/groups";
                    });
                }
            } else if (job.status === "failed") {
                clearInterval(interval);
                if (Swal.isVisible()) {
                    Swal.fire({
                        title: 'Import Failed',
                        text: job.errors ? job.errors.join("\n") : "Unknown Error",
                        type: 'error'
                    });
                }
            } else if (job.status === "cancelled") {
                clearInterval(interval);
                if (Swal.isVisible()) {
                    Swal.fire({
                        title: 'Import Cancelled',
                        text: 'The import process was stopped.',
                        type: 'warning'
                    });
                }
            }
        }).fail(function () {
            clearInterval(interval);
            if (Swal.isVisible()) {
                Swal.fire('Error', 'Failed to poll job status', 'error');
            }
        });
    }, 1000);
}

function loadGroup(id) {
    if (!id) return;
    var targetsTable = $("#targetsTable").DataTable();

    api.groupId.get(id)
        .done(function (g) {
            group = g
            $("#groupModalLabel").text("Edit Group: " + group.name)
            $("#name").val(group.name)
            $("#group_type").val(group.group_type || "email")

            targetsTable.clear();
            var targetRows = []
            $.each(group.targets, function (i, record) {
                targetRows.push([
                    escapeHtml(record.first_name),
                    escapeHtml(record.last_name),
                    escapeHtml(record.email),
                    escapeHtml(record.position),
                    '<span style="cursor:pointer;"><i class="fa fa-trash-o"></i></span>'
                ])
            });
            targetsTable.rows.add(targetRows).draw()
        })
        .fail(function () {
            errorFlash("Error fetching group")
        })
}

$(document).ready(function () {
    var targetsTable = $("#targetsTable").DataTable({
        destroy: true, // Destroy any other instantiated table - http://datatables.net/manual/tech-notes/3#destroy
        columnDefs: [{
            orderable: false,
            targets: "no-sort"
        }]
    })

    $("#saveSubmit").click(save)

    // Handle manual additions
    $("#targetForm").submit(function () {
        // Validate the form data
        var targetForm = document.getElementById("targetForm")
        if (!targetForm.checkValidity()) {
            targetForm.reportValidity()
            return
        }
        addTarget(
            $("#firstName").val(),
            $("#lastName").val(),
            $("#email").val(),
            $("#position").val());
        targetsTable.draw();

        // Reset user input.
        $("#targetForm>div>input").val('');
        $("#firstName").focus();
        return false;
    });

    // Handle Deletion
    $("#targetsTable").on("click", "span>i.fa-trash-o", function () {
        targetsTable
            .row($(this).parents('tr'))
            .remove()
            .draw();
    });

    // Handle file uploads
    $("#csvupload").fileupload({
        url: "/api/import/group/bulk",
        dataType: "json",
        paramName: 'file',
        formData: function (form) {
            var data = form.serializeArray();
            if (groupId) {
                data.push({ name: 'group_id', value: groupId });
            }
            return data;
        },
        add: function (e, data) {
            $("#modal\\.flashes").empty()
            var acceptFileTypes = /(csv|txt)$/i;
            var filename = data.originalFiles[0]['name']
            if (filename && !acceptFileTypes.test(filename.split(".").pop())) {
                modalError("Unsupported file extension (use .csv or .txt)")
                return false;
            }
            // Ensure token is cleared on new upload
            $("#saveSubmit").removeData("bulk-token");
            data.submit();
        },
        done: function (e, data) {
            if (data.result.success && data.result.file_token) {
                // Store token in DOM
                $("#saveSubmit").data("bulk-token", data.result.file_token);

                // Clear existing table
                targetsTable.clear().draw();

                // Add preview rows
                if (data.result.preview && data.result.preview.length > 0) {
                    $.each(data.result.preview, function (i, record) {
                        addTarget(
                            record.first_name || "",
                            record.last_name || "",
                            record.email || "",
                            record.position || "");
                    });
                    targetsTable.draw();
                }

                // Show info message
                Swal.fire({
                    title: 'Preview Loaded',
                    text: 'Showing first ' + data.result.preview.length + ' of ' + data.result.total_count + ' records. Click "Save Group" to finalize the import.',
                    type: 'info'
                });

            } else {
                modalError(data.result.message || "Unknown error during upload");
            }
        },
        fail: function (e, data) {
            modalError("Upload failed: " + (data.responseJSON ? data.responseJSON.message : "Server error"));
        }
    })

    $("#csv-template").click(downloadCSVTemplate)

    if (groupId) {
        loadGroup(groupId)
    }
})
