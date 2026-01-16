// Redirectors Management
var redirectors = [];
var currentPage = 1;
var itemsPerPage = 6;

const API_BASE = "/api/simulationserver/redirectors";

// Load redirectors on page load
$(document).ready(function () {
    loadRedirectors();

    // Search handler
    $("#searchRedirectors").on("keyup", function () {
        currentPage = 1;
        renderRedirectorCards();
    });

    // Initialize CKEditor when modal opens
    $("#redirectorModal").on("shown.bs.modal", function () {
        if (!CKEDITOR.instances.redirectorHtml) {
            $("#redirectorHtml").ckeditor({
                height: 300,
                allowedContent: true,
                extraAllowedContent: '*(*);*{*}',
                fullPage: true
            });
        }
    });
});

// Load all redirectors from API
function loadRedirectors() {
    $("#loading").show();
    $("#redirectorGrid").hide();
    $("#emptyMessage").hide();

    $.ajax({
        url: API_BASE,
        method: "GET",
        success: function (response) {
            $("#loading").hide();

            if (response.success && Array.isArray(response.redirectors)) {
                redirectors = response.redirectors;
            } else if (Array.isArray(response)) {
                redirectors = response;
            } else {
                redirectors = [];
            }

            if (redirectors.length === 0) {
                $("#emptyMessage").show();
            } else {
                $("#redirectorGrid").show();
                renderRedirectorCards();
            }
        },
        error: function (xhr) {
            $("#loading").hide();
            showError("Failed to load redirectors: " + (xhr.responseJSON?.message || "Unknown error"));
        }
    });
}

// Render redirector cards
function renderRedirectorCards() {
    var grid = $("#redirectorGrid");
    grid.empty();

    // Filter by search
    var searchTerm = $("#searchRedirectors").val().toLowerCase();
    var filtered = redirectors.filter(function (r) {
        var name = r.name || r;
        return !searchTerm || name.toLowerCase().indexOf(searchTerm) > -1;
    });

    if (filtered.length === 0) {
        grid.html('<div class="col-md-12"><div class="alert alert-info">No redirectors match your search.</div></div>');
        $("#redirectorPagination").hide();
        return;
    }

    // Pagination
    var totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = 1;

    var startIdx = (currentPage - 1) * itemsPerPage;
    var endIdx = startIdx + itemsPerPage;
    var pageItems = filtered.slice(startIdx, endIdx);

    // Render cards
    pageItems.forEach(function (redirector) {
        var name = redirector.name || redirector;
        var htmlEscaped = redirector.html_escaped || "";
        var htmlBase64 = redirector.html_base64 || "";

        // Decode base64 for iframe preview if available
        var previewHtml = "";
        if (htmlBase64) {
            try {
                previewHtml = atob(htmlBase64);
            } catch (e) {
                previewHtml = htmlEscaped;
            }
        } else if (htmlEscaped) {
            // Convert escaped HTML back to real HTML for preview
            var div = document.createElement('div');
            div.innerHTML = htmlEscaped;
            previewHtml = div.textContent || div.innerText || "";
        }

        var cardHtml = `
            <div class="col-md-4 col-sm-6">
                <div class="redirector-card" id="card-${escapeHtml(name)}">
                    <div class="redirector-header">
                        <div class="redirector-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
                        <button class="btn btn-success btn-xs btn-action-preview" onclick="previewFull('${escapeHtml(name)}'); event.stopPropagation();" 
                                style="padding: 4px 8px; font-size: 14px; font-weight: bold;">
                            FULL PREVIEW
                        </button>
                    </div>
                    <div class="redirector-preview">
                        <iframe srcdoc="${previewHtml.replace(/"/g, '&quot;')}" sandbox></iframe>
                    </div>
                    <div class="redirector-footer">
                        <div class="redirector-actions">
                            <button class="btn btn-default btn-sm btn-action" onclick="editRedirector('${escapeHtml(name)}'); event.stopPropagation();" title="Edit">
                                <i class="fa fa-pencil"></i>
                            </button>
                            <button class="btn btn-danger btn-sm btn-action-delete" onclick="deleteRedirector('${escapeHtml(name)}'); event.stopPropagation();" title="Delete">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        grid.append(cardHtml);
    });

    // Render pagination
    renderPagination(totalPages);
}

// Render pagination controls
function renderPagination(totalPages) {
    if (totalPages <= 1) {
        $("#redirectorPagination").hide();
        return;
    }

    var html = '<ul class="pagination" style="margin: 0;">';
    html += '<li class="' + (currentPage === 1 ? 'disabled' : '') + '"><a href="#" onclick="changePage(' + (currentPage - 1) + '); return false;">&laquo;</a></li>';

    for (var i = 1; i <= totalPages; i++) {
        html += '<li class="' + (i === currentPage ? 'active' : '') + '"><a href="#" onclick="changePage(' + i + '); return false;">' + i + '</a></li>';
    }

    html += '<li class="' + (currentPage === totalPages ? 'disabled' : '') + '"><a href="#" onclick="changePage(' + (currentPage + 1) + '); return false;">&raquo;</a></li>';
    html += '</ul>';

    $("#redirectorPagination").html(html).show();
}

// Change page
function changePage(page) {
    var totalPages = Math.ceil(redirectors.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderRedirectorCards();
}

// Open create modal
function openCreateModal() {
    $("#redirectorModalTitle").text("New Redirector");
    $("#editingRedirectorName").val("");
    $("#redirectorName").val("").prop("readonly", false);

    if (CKEDITOR.instances.redirectorHtml) {
        CKEDITOR.instances.redirectorHtml.setData("");
    } else {
        $("#redirectorHtml").val("");
    }

    $("#redirectorModal").modal("show");
}

// Edit redirector
function editRedirector(name) {
    var redirector = redirectors.find(function (r) {
        return (r.name || r) === name;
    });

    if (!redirector) {
        showError("Redirector not found");
        return;
    }

    $("#redirectorModalTitle").text("Edit Redirector");
    $("#editingRedirectorName").val(name);
    $("#redirectorName").val(name).prop("readonly", true);

    // Decode base64 HTML for editing
    var html = "";
    if (redirector.html_base64) {
        try {
            html = atob(redirector.html_base64);
        } catch (e) {
            html = "";
        }
    }

    if (CKEDITOR.instances.redirectorHtml) {
        CKEDITOR.instances.redirectorHtml.setData(html);
    } else {
        $("#redirectorHtml").val(html);
    }

    $("#redirectorModal").modal("show");
}

// Save redirector
function saveRedirector() {
    var editingName = $("#editingRedirectorName").val();
    var name = $("#redirectorName").val().trim();
    var html = CKEDITOR.instances.redirectorHtml ?
        CKEDITOR.instances.redirectorHtml.getData() :
        $("#redirectorHtml").val();

    if (!name) {
        showError("Please enter a name");
        return;
    }

    if (/\s/.test(name)) {
        showError("Name cannot contain spaces");
        return;
    }

    if (!html) {
        showError("Please enter HTML content");
        return;
    }

    var btn = $("#saveRedirectorBtn");
    var originalHtml = btn.html();
    btn.html('<i class="fa fa-spinner fa-spin"></i> Saving...').prop("disabled", true);

    var isEdit = editingName !== "";
    var url = isEdit ? API_BASE + "/" + encodeURIComponent(editingName) : API_BASE;
    var method = isEdit ? "PUT" : "POST";

    $.ajax({
        url: url,
        method: method,
        contentType: "application/json",
        data: JSON.stringify({
            name: name,
            html: html
        }),
        success: function (response) {
            btn.html(originalHtml).prop("disabled", false);

            if (response.success) {
                $("#redirectorModal").modal("hide");
                showSuccess(isEdit ? "Redirector updated!" : "Redirector created!");
                loadRedirectors();
            } else {
                showError(response.message || response.error || "Failed to save");
            }
        },
        error: function (xhr) {
            btn.html(originalHtml).prop("disabled", false);
            showError("Failed to save: " + (xhr.responseJSON?.message || "Server error"));
        }
    });
}

// Delete redirector
function deleteRedirector(name) {
    Swal.fire({
        title: "Are you sure?",
        text: "Delete redirector '" + name + "'?",
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        confirmButtonText: "Yes, delete it!"
    }).then(function (result) {
        if (result.value) {
            $.ajax({
                url: API_BASE + "/" + encodeURIComponent(name),
                method: "DELETE",
                success: function (response) {
                    if (response.success) {
                        showSuccess("Redirector deleted!");
                        loadRedirectors();
                    } else {
                        showError(response.message || "Failed to delete");
                    }
                },
                error: function () {
                    showError("Failed to delete redirector");
                }
            });
        }
    });
}

// Full preview
function previewFull(name) {
    var redirector = redirectors.find(function (r) {
        return (r.name || r) === name;
    });

    if (!redirector) return;

    var html = "";
    if (redirector.html_base64) {
        try {
            html = atob(redirector.html_base64);
        } catch (e) {
            html = redirector.html_escaped || "";
        }
    }

    // Open in modal
    $("#previewModalTitle").text("Preview: " + name);
    var iframe = document.getElementById("previewFrame");
    iframe.srcdoc = html;

    // Show modal
    $("#previewModal").modal("show");
}

// Helper: Escape HTML
function escapeHtml(text) {
    if (!text) return "";
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// Helper: Show success message
function showSuccess(message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success',
            title: 'Success',
            text: message,
            timer: 2000,
            showConfirmButton: false
        });
    } else {
        $("#flashes").html('<div class="alert alert-success">' + message + '</div>');
    }
}

// Helper: Show error message
function showError(message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: message
        });
    } else {
        $("#flashes").html('<div class="alert alert-danger">' + message + '</div>');
    }
}
