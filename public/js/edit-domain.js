document.addEventListener('DOMContentLoaded', function() {
    const searchForm = document.getElementById('searchForm');
    const editForm = document.getElementById('editForm');

    searchForm.addEventListener('submit', function(event) {
        event.preventDefault();
        const searchDomain = document.getElementById('searchDomain').value;

        fetch(`/search-domain?domainName=${encodeURIComponent(searchDomain)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data && data.domain_name) {
                    editForm.style.display = 'block';

                    document.getElementById('domainName').value = data.domain_name;
                    document.getElementById('domainType').value = data.domain_type;
                    document.getElementById('company').value = data.company;
                    document.getElementById('registerDate').value = data.register_date.split('T')[0];
                    document.getElementById('renewalDate').value = data.next_renewal_date.split('T')[0];
                    document.getElementById('status').value = data.status;
                    document.getElementById('hostingType').value = data.hosting_type;
                } else {
                    alert('Domain not found');
                }
            })
            .catch(error => {
                console.error('Error:', error.message);
                alert('An error occurred while searching for the domain');
            });
    });

    editForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const updatedData = {
            domainName: document.getElementById('domainName').value,
            domainType: document.getElementById('domainType').value,
            company: document.getElementById('company').value,
            registerDate: document.getElementById('registerDate').value,
            renewalDate: document.getElementById('renewalDate').value,
            status: document.getElementById('status').value,
            hostingType: document.getElementById('hostingType').value,
        };

        fetch('/update-domain', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                alert('Domain updated successfully!');
                editForm.reset();
                editForm.style.display = 'none';
            } else {
                alert('Failed to update domain');
            }
        })
        .catch(error => {
            console.error('Error:', error.message);
            alert('An error occurred while updating the domain');
        });
    });
});
