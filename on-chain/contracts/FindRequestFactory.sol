pragma solidity ^0.4.18;

// DEV Imports - just to test contract in remix
// import "github.com/OpenZeppelin/zeppelin-solidity/contracts/ownership/Ownable.sol";
// import "github.com/OpenZeppelin/zeppelin-solidity/contracts/math/SafeMath.sol";
// TODO: Fix this import, do not load in remix for some reason
//import "https://github.com/zeppelinos/zos/blob/master/packages/lib/contracts/migrations/Migratable.sol";


import "zos-lib/contracts/migrations/Migratable.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract FindRequestFactory is Ownable, Migratable {
    address[] private deployedFindRequest;

    event newFindRequestCreated(address newAddress);

    function initialize() public isInitializer("FindRequestFactory", "0")  {
        // Init some variables here
    }

    function createFindRequest(uint8 _age, string _location, string _lost_date, string _description) public payable {
        // TODO > put some requirements for de parameters

        // Create new Find Request contract and get deployed address
        address newFindRequest = new FindRequest(msg.sender, _age, _location, _lost_date, _description);

        // Save new contract address and increment total counter
        deployedFindRequest.push(newFindRequest);

        // Transfer the created contract the initial amount
        newFindRequest.transfer(msg.value);

        // Send Find Request Created event
        emit newFindRequestCreated(newFindRequest);
    }


    function getFindRequest(uint findRequestNumber) public view returns (address) {
        require(deployedFindRequest.length > findRequestNumber);
        return deployedFindRequest[findRequestNumber];
    }

    // Return a summary tuple of relevant variables of the factory contract
    function getSummary() public view returns (address, uint, uint) {
        return (
          owner,
          this.balance,
          deployedFindRequest.length
        );
    }

    // Default function to withdraw balance from factory contract
    function withdraw(uint amount) public onlyOwner returns(bool) {
        require(amount <= address(this).balance);
        owner.transfer(amount);
        return true;
    }

    // Default anonymous function allow deposits to the contract
    function () public payable {
    }
}

contract FindRequest is Ownable {
    uint8 private age;
    string private location;
    string private lost_date;
    string private description;
    address private curator;
    uint private initialIncentive;
    uint private incentiveToRedeem;
    uint8 private findRequestState;
    string closingMessage;

    string[] private knownLocations;
    mapping(address => bool) acceptedHintsMap;
    mapping(address => bool) allowedHintsWatchers;
    uint acceptedHints;
    uint acceptedHintsResponses;

    struct Hint {
        string text;
        uint8 state;
        // TODO Maybe add here a posible location parameters
    }

    Hint[] private receivedHints;
    uint minimumTranferCost;

    // TODO Implement this contract state
    enum FindRequestState {
      Open, // 1
      RedeemingIncentives, // 2
      RedeemingBalances, // 3
      Close, // 4
      BalanceDistributed // 5
    }

    // FindRequest constructor
    constructor(address _owner, uint8 _age, string _location, string _lost_date, string _description) public payable {
        owner = _owner;
        age = _age;
        location = _location;
        lost_date = _lost_date;
        description = _description;
        curator = msg.sender;
        initialIncentive = msg.value;
        findRequestState = 1;
        acceptedHints = 0;
        minimumTranferCost = 200000;
    }

    modifier onlyHinter() {
        _;
    }

    modifier onlyCurator() {
        require(curator == msg.sender);
        _;
    }

    modifier ownerOrWatcher() {
        require(_isOwnerOrWatcher());
        _;
    }

    function getCurrentState() public view returns(uint8) {
        return findRequestState;
    }

    // Return a summary tuple of relevant variables of the factory contract
    function getSummary() public view returns(address,uint,uint,string,string,string,uint,uint) {
        return (
          owner,
          this.balance,
          age,
          location,
          lost_date,
          description,
          knownLocations.length,
          receivedHints.length
        );
    }

    function getCurator() public view returns(address) {
      return curator;
    }

    function addKnownLocation(string location) public payable onlyOwner {
        require(!compare(location, ""));
        knownLocations.push(location);
    }

    function getKnownLocations(uint knownLocationNumber) public view returns(string) {
        require(knownLocations.length > knownLocationNumber);
        return knownLocations[knownLocationNumber];
    }

    function submitHint(string _text) public payable {
        require(msg.sender != owner);
        require(!compare(_text, ""));

        Hint memory newHint = Hint(_text, 1);
        receivedHints.push(newHint);
    }

    function acceptHint(uint _hintNumber) public onlyOwner payable {
        require(receivedHints.length > _hintNumber);
        Hint storage _hint = receivedHints[_hintNumber];

        // Validates hint is not in a final state
        require(_hint.state == 1);
        _hint.state = 2; // Accepted

        // Register accepted address and increment counter
        acceptedHints++;
        acceptedHintsMap[msg.sender] = true;
    }

    function getHint(uint _hintNumber) public view ownerOrWatcher returns(string,uint) {
        require(receivedHints.length > _hintNumber);
        Hint storage selectedHint = receivedHints[_hintNumber];
        return (
          selectedHint.text,
          uint(selectedHint.state)
        );
    }

    function rejectHint(uint _hintNumber) public onlyOwner payable {
        require(receivedHints.length > _hintNumber);
        Hint storage _hint = receivedHints[_hintNumber];

        // Validates hint is not in a final state
        require(_hint.state == 1);
        _hint.state = 3; // Rejected
    }

    function closeFinding(string finalText) public payable onlyOwner {
        require(findRequestState == 1); // 1 = Open

        // TODO Pay gas cost of all Hints received (accepted or not)

        // Calculate max incentive to Redeem (90% of total incentive stored)
        uint totalIncentiveToRedeem = SafeMath.div(SafeMath.mul(this.balance, 90), 100);

        // Verify that there is any accepted hints
        if (acceptedHints > 0) {
            // Change state to RedeemingIncentives (code: 2)
            findRequestState = 2;
            incentiveToRedeem = SafeMath.div(totalIncentiveToRedeem, acceptedHints);
        } else {
            // Change state to RedeemingBalances (code: 3)
            findRequestState = 3;
        }

        // Set the closing message
        closingMessage = finalText;
    }

    function redeemIncentive() public payable onlyHinter {
        require(findRequestState == 2); // 2 = RedimingIncentives
        require(acceptedHintsMap[msg.sender]);

        // Transfer incentive money to acceptedHints address
        msg.sender.transfer(incentiveToRedeem);

        // Remove address from acceptedHintsMap and record the response
        acceptedHintsMap[msg.sender] = false;
        acceptedHintsResponses++;

        // Check if all accepted hints responses were recorder
        if (acceptedHintsResponses == acceptedHints) {
            findRequestState = 3; // 3 = RedimingBalances
        }
    }

    function rejectIncentive() public payable onlyHinter {
        require(findRequestState == 2); // 2 = RedimingIncentives
        require(acceptedHintsMap[msg.sender]);

        // Remove address from acceptedHintsMap and record the response
        acceptedHintsMap[msg.sender] = false;
        acceptedHintsResponses++;
    }

    function redeemBalance() public payable onlyOwner {
        require(findRequestState == 3); // 3 = RedimingBalances
        uint amountToRedeem = 0;

        // Check if the current balance (initial incentive + donations) is higher than initial incentive
        if (this.balance > initialIncentive) {
            // AVOID FRAUD VECTOR
            // Only transfer 90% of the initial incentive
            amountToRedeem = SafeMath.div(SafeMath.mul(initialIncentive, 90), 100);
        } else {
            amountToRedeem = this.balance;
        }

        // Always save this amount fix to make sure all transfers ends correctly
        if (amountToRedeem > minimumTranferCost) {
            // Transfer money to owner only if the balance covers the costs
            owner.transfer(SafeMath.sub(amountToRedeem, minimumTranferCost));
        }

        // Change state to Closed (code: 4)
        findRequestState = 4;
    }

    function rejectBalance() public payable onlyOwner {
        require(findRequestState == 3); // 3 = RedimingBalances

        // Change state to Closed (code: 4)
        findRequestState = 4;
    }

    function cancelFindRequest() public payable onlyCurator {
        // Change state to Closed (code: 4)
        findRequestState = 4;
    }

    // The current balance is gonna be distributed when the contract
    // get the confirmation that associated sentitive data was errased
    // from the private chain or server
    function executeDonationDistrubutionSystem(address beneficiaryA, address beneficiaryB) public payable onlyCurator {
        require(findRequestState == 4); // 4 = Close
        require(beneficiaryA != address(0));
        require(beneficiaryB != address(0));
        require(beneficiaryA != beneficiaryB);

        // Share balance equaly between 2 other FindRequest
        if (this.balance > minimumTranferCost) {

            // Calculate amount to transfer
            uint amountToDonate = SafeMath.sub(this.balance, minimumTranferCost);
            uint amountPerBeneficiary = SafeMath.div(amountToDonate, 2);

            // Make transfer
            beneficiaryA.transfer(amountPerBeneficiary);
            beneficiaryB.transfer(amountPerBeneficiary);
        }

        // Change state to BalanceDistributed (code: 5)
        findRequestState = 5;
    }

    // Grant access to watchers
    function grantAccessToWatchHints(address watcherAddress) public payable onlyOwner {
        allowedHintsWatchers[watcherAddress] = true;
    }

    function receiveDonations() public payable {
    }

    // Default anonymous function allow deposits to the contract
    function () public payable {
    }

    // Utility function to compare strings
    function compare(string a, string b) internal returns (bool) {
        if(bytes(a).length != bytes(b).length) {
            return false;
        } else {
            return keccak256(a) == keccak256(b);
        }
    }

    // Utility function to check if the sender is owner or watcher
    function _isOwnerOrWatcher() private view returns(bool){
        if (owner == msg.sender) {
            return true;
        } else {
            if (allowedHintsWatchers[msg.sender] == true) {
                return true;
            }
            return false;
        }
    }
}
