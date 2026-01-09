async function triggerStrike() {
    const campaign = document.getElementById('campaignName').value;
    const btn = document.getElementById('triggerBtn');

    if (!campaign) {
        alert("Please enter a campaign name");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Triggering...';

    try {
        const response = await fetch('/api/simulationserver/trigger_strike', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign: campaign })
        });

        const data = await response.json();

        if (data.success) {
            alert("Success: " + data.message);
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-bolt"></i> Trigger Strike';
    }
}

async function generateUrl() {
    const btn = document.getElementById('genBtn');
    const resultArea = document.getElementById('resultArea');
    const phishlet = document.getElementById('phishlet').value;

    btn.disabled = true;
    btn.innerText = "Processing...";

    try {
        const response = await fetch('http://localhost:3000/geturl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phishlet: phishlet })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('resUrlLink').value = data.url;
            document.getElementById('resLureId').innerText = data.lure_id;
            resultArea.classList.remove('hidden');
        } else {
            alert("Error: " + (data.error || "Failed to generate"));
        }
    } catch (err) {
        alert("Connection failed. Is the Go Agent running?");
    } finally {
        btn.disabled = false;
        btn.innerText = "Generate Lure URL";
    }
}

function copyToClipboard() {
    const copyText = document.getElementById("urlOutput");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    alert("Copied!");
}